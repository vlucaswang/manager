import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { AmpInstance, InstanceConfig, AgentEvent, AmpSettings, ThreadInfo } from '../types/AmpInstance.js';
import { AmpLogMonitor } from './AmpLogMonitor.js';

export class TmuxManager {
  private sessionName: string;
  private instances: Map<string, AmpInstance> = new Map();
  private sessionExists = false;
  private outputMonitors: Map<string, NodeJS.Timeout> = new Map();
  private logMonitors: Map<string, AmpLogMonitor> = new Map();
  private watchdogInterval: NodeJS.Timeout | null = null;
  private eventCallbacks: ((event: AgentEvent) => void)[] = [];
  private globalAmpSettings: AmpSettings = {};
  private settingsDir: string;

  constructor(sessionName: string) {
    this.sessionName = sessionName;
    this.settingsDir = join(process.env.HOME || '/tmp', '.config', 'amp-manager');
    this.startWatchdog();
    this.loadGlobalSettings();
  }

  // Event emission for supervisor monitoring
  onAgentEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  private emitEvent(instanceId: string, type: AgentEvent['type'], data: any, severity: AgentEvent['severity'] = 'info'): void {
    const event: AgentEvent = {
      instanceId,
      timestamp: new Date(),
      type,
      data,
      severity
    };
    
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.warn('Error in event callback:', error);
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Check if session exists
      await this.runTmuxCommand(['has-session', '-t', this.sessionName]);
      this.sessionExists = true;
    } catch {
      // Session doesn't exist, create it
      await this.runTmuxCommand(['new-session', '-d', '-s', this.sessionName]);
      this.sessionExists = true;
    }
  }

  private async loadGlobalSettings(): Promise<void> {
    try {
      await fs.mkdir(this.settingsDir, { recursive: true });
      const settingsFile = join(this.settingsDir, 'amp-settings.json');
      
      if (await fs.access(settingsFile).then(() => true).catch(() => false)) {
        const content = await fs.readFile(settingsFile, 'utf8');
        this.globalAmpSettings = JSON.parse(content);
      } else {
        // Create default settings
        this.globalAmpSettings = {
          'amp.notifications.enabled': true,
          'amp.commands.allowlist': [
            'git status',
            'ls -la',
            'pwd',
            'cat',
            'grep'
          ],
          'amp.tools.disable': []
        };
        await this.saveGlobalSettings();
      }
    } catch (error) {
      console.warn('Failed to load amp settings:', error);
    }
  }

  private async saveGlobalSettings(): Promise<void> {
    try {
      const settingsFile = join(this.settingsDir, 'amp-settings.json');
      await fs.writeFile(settingsFile, JSON.stringify(this.globalAmpSettings, null, 2));
    } catch (error) {
      console.warn('Failed to save amp settings:', error);
    }
  }

  async createInstance(config?: InstanceConfig): Promise<AmpInstance> {
    if (!this.sessionExists) {
      throw new Error('Tmux session not initialized');
    }

    const id = uuidv4();
    const name = config?.name || `amp-${id.slice(0, 8)}`;
    const paneId = `${this.sessionName}:${name}`;
    const workingDir = config?.workingDirectory || process.cwd();
    
    // Create log file path
    const logDir = '/tmp/amp-manager';
    await fs.mkdir(logDir, { recursive: true });
    const logFile = join(logDir, `${name}.log`);

    // Create new window for this instance
    await this.runTmuxCommand([
      'new-window', 
      '-t', this.sessionName, 
      '-n', name,
      '-c', workingDir
    ]);

    const defaultErrorPatterns = [
      'prompt is too long',
      'after property name in JSON at',
      'exceed context limit:',
      'Shutting down...',
      'Error:',
      'ERROR:',
      'Fatal:',
      'FATAL:',
      'timeout',
      'connection refused',
      'authentication failed',
      'Out of free credits',
      'Amp update failed',
      'update failed',
      'network error',
      'connection timeout'
    ];

    const instance: AmpInstance = {
      id,
      name,
      tmuxPane: paneId,
      status: 'idle',
      createdAt: new Date(),
      lastActivity: new Date(),
      lastInactivityCheck: new Date(),
      workingDirectory: workingDir,
      logFile,
      output: [],
      threadId: config?.threadId,
      authStatus: 'unknown',
      config: config || {},
      errorPatterns: config?.errorPatterns || defaultErrorPatterns,
      inactivityThreshold: config?.inactivityThreshold || 120, // 2 minutes default
      ampSettings: { ...this.globalAmpSettings, ...config?.ampSettings },
      stats: {
        promptsExecuted: 0,
        tokensUsed: 0,
        uptime: 0,
        restartCount: 0
      }
    };

    // Set up environment and start amp CLI
    await this.setupInstanceEnvironment(instance);
    await this.startAmpCLI(instance);

    // Check authentication status
    await this.checkAuthStatus(instance);

    // Send initial prompt if provided
    if (config?.initialPrompt) {
      await this.sendPrompt(id, config.initialPrompt);
    }

    this.instances.set(id, instance);
    
    // Start monitoring output for this instance
    this.startOutputMonitoring(id);
    
    // Start log monitoring for better status detection
    this.startLogMonitoring(id);
    
    this.emitEvent(id, 'status_changed', { status: 'idle', name }, 'info');
    
    return instance;
  }

  private async setupInstanceEnvironment(instance: AmpInstance): Promise<void> {
    const envVars: string[] = [];
    
    // Set log file and level
    if (instance.logFile) {
      envVars.push(`export AMP_LOG_FILE="${instance.logFile}"`);
    }
    
    const logLevel = instance.config.logLevel || 'debug';
    envVars.push(`export AMP_LOG_LEVEL="${logLevel}"`);
    
    // Set settings file path for this instance
    const instanceSettingsFile = join(this.settingsDir, `${instance.name}-settings.json`);
    envVars.push(`export AMP_SETTINGS_FILE="${instanceSettingsFile}"`);
    
    // Add custom environment variables
    if (instance.config.environment) {
      Object.entries(instance.config.environment).forEach(([key, value]) => {
        envVars.push(`export ${key}="${value}"`);
      });
    }
    
    // Send environment setup
    for (const envVar of envVars) {
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        envVar,
        'Enter'
      ]);
    }
    
    // Create instance-specific settings file
    if (instance.ampSettings) {
      await fs.writeFile(instanceSettingsFile, JSON.stringify(instance.ampSettings, null, 2));
    }
    
    // Small delay to let environment vars set
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private async startAmpCLI(instance: AmpInstance): Promise<void> {
    const ampCommand = this.buildAmpCommand(instance);
    
    // Start amp CLI in the pane
    await this.runTmuxCommand([
      'send-keys', 
      '-t', `${this.sessionName}:${instance.name}`, 
      ampCommand, 
      'Enter'
    ]);

    // Wait a moment for amp to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async checkAuthStatus(instance: AmpInstance): Promise<void> {
    try {
      // Try to get amp version to check if authenticated
      instance.status = 'authenticating';
      this.emitEvent(instance.id, 'auth_status_changed', { status: 'checking' }, 'info');
      
      // Send a simple command to test authentication
      // Wait a bit for amp to fully start first
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'help',
        'Enter'
      ]);
      
      // We'll check the output later to determine auth status
      setTimeout(() => {
        this.updateAuthStatusFromOutput(instance.id);
      }, 3000);
      
    } catch (error) {
      instance.authStatus = 'failed';
      this.emitEvent(instance.id, 'auth_status_changed', { status: 'failed', error }, 'error');
    }
  }

  private async updateAuthStatusFromOutput(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    try {
      const output = await this.getInstanceOutput(instanceId);
      const recentOutput = output.slice(-10).join(' ').toLowerCase();
      
      if (recentOutput.includes('authentication failed') || 
          recentOutput.includes('not authenticated') ||
          recentOutput.includes('please authenticate')) {
        instance.authStatus = 'failed';
        instance.status = 'error';
        this.emitEvent(instanceId, 'auth_status_changed', { status: 'failed' }, 'error');
      } else if (recentOutput.includes('out of free credits') || 
                 recentOutput.includes('insufficient credits')) {
        instance.authStatus = 'failed';
        instance.status = 'error';
        this.emitEvent(instanceId, 'auth_status_changed', { status: 'out_of_credits' }, 'error');
      } else if (recentOutput.includes('amp can help') || 
                 recentOutput.includes('help for command') ||
                 recentOutput.includes('type') ||
                 recentOutput.includes('available commands') ||
                 output.some(line => line.includes('>'))) {
        // If we see help output or the prompt, auth is likely successful
        instance.authStatus = 'authenticated';
        instance.status = 'idle';
        this.emitEvent(instanceId, 'auth_status_changed', { status: 'authenticated' }, 'info');
      } else {
        // If we can't determine, assume it's working if no errors
        instance.authStatus = 'authenticated';
        instance.status = 'idle';
        this.emitEvent(instanceId, 'auth_status_changed', { status: 'authenticated' }, 'info');
      }
    } catch (error) {
      console.warn('Failed to check auth status:', error);
      // Default to authenticated if we can't check
      instance.authStatus = 'authenticated';
      instance.status = 'idle';
    }
  }

  // Thread management methods
  async createThread(instanceId: string): Promise<string | null> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    try {
      // First, exit the current amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'C-c'
      ]);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Use amp CLI to create a new thread
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp threads new',
        'Enter'
      ]);

      // Wait for thread creation and parse output
      await new Promise(resolve => setTimeout(resolve, 3000));
      const output = await this.getInstanceOutput(instanceId);
      
      // Look for thread ID in output
      const threadMatch = output.join(' ').match(/([a-f0-9-]{8,})/i);
      if (threadMatch) {
        const threadId = threadMatch[1];
        instance.threadId = threadId;
        
        // Now start amp with the new thread
        await this.runTmuxCommand([
          'send-keys', 
          '-t', `${this.sessionName}:${instance.name}`, 
          `amp --thread-id ${threadId}`,
          'Enter'
        ]);
        
        this.emitEvent(instanceId, 'thread_created', { threadId }, 'info');
        return threadId;
      }
      
      // If no thread ID found, restart amp normally
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp',
        'Enter'
      ]);
      
      return null;
    } catch (error) {
      this.emitEvent(instanceId, 'error_detected', { error: 'Failed to create thread' }, 'error');
      return null;
    }
  }

  async switchThread(instanceId: string, threadId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    try {
      // Exit current amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'C-c'
      ]);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Start amp with specific thread ID
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        `amp --thread-id ${threadId}`,
        'Enter'
      ]);

      instance.threadId = threadId;
      this.emitEvent(instanceId, 'thread_switched', { threadId }, 'info');
    } catch (error) {
      this.emitEvent(instanceId, 'error_detected', { error: 'Failed to switch thread' }, 'error');
    }
  }

  async listThreads(instanceId: string): Promise<ThreadInfo[]> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    try {
      // Exit current amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'C-c'
      ]);

      await new Promise(resolve => setTimeout(resolve, 500));

      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp threads list',
        'Enter'
      ]);

      // Wait for output and parse threads
      await new Promise(resolve => setTimeout(resolve, 3000));
      const output = await this.getInstanceOutput(instanceId);
      
      // Parse thread list from output
      const threads: ThreadInfo[] = [];
      // This would need to be implemented based on actual amp CLI output format
      
      // Restart amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp',
        'Enter'
      ]);
      
      return threads;
    } catch (error) {
      console.warn('Failed to list threads:', error);
      return [];
    }
  }

  async getTools(instanceId: string): Promise<string[]> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    try {
      // Exit current amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'C-c'
      ]);

      await new Promise(resolve => setTimeout(resolve, 500));

      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp tools show',
        'Enter'
      ]);

      // Wait for output and parse tools
      await new Promise(resolve => setTimeout(resolve, 3000));
      const output = await this.getInstanceOutput(instanceId);
      
      // Parse available tools from output
      const tools: string[] = [];
      // This would need to be implemented based on actual amp CLI output format
      
      // Restart amp session
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        'amp',
        'Enter'
      ]);
      
      return tools;
    } catch (error) {
      console.warn('Failed to get tools:', error);
      return [];
    }
  }

  async restartInstance(instanceId: string, reason?: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    this.emitEvent(instanceId, 'restart_triggered', { reason }, 'warn');

    // Stop monitoring temporarily
    this.stopOutputMonitoring(instanceId);
    this.stopLogMonitoring(instanceId);

    // Send Ctrl+C to kill current process
    await this.runTmuxCommand([
      'send-keys', 
      '-t', `${this.sessionName}:${instance.name}`, 
      'C-c'
    ]);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear the terminal
    await this.runTmuxCommand([
      'send-keys', 
      '-t', `${this.sessionName}:${instance.name}`, 
      'clear', 
      'Enter'
    ]);

    // Reset instance state
    instance.status = 'idle';
    instance.lastActivity = new Date();
    instance.lastInactivityCheck = new Date();
    instance.currentPrompt = undefined;
    instance.pendingCommand = undefined;
    instance.output = [];
    instance.stats.restartCount++;
    instance.stats.lastRestart = new Date();

    // Restart amp CLI with environment
    await this.setupInstanceEnvironment(instance);
    await this.startAmpCLI(instance);

    // Resume monitoring
    this.startOutputMonitoring(instanceId);
    this.startLogMonitoring(instanceId);

    this.emitEvent(instanceId, 'status_changed', { status: 'idle', restartCount: instance.stats.restartCount }, 'info');
  }

  private startWatchdog(): void {
    // Run watchdog every 30 seconds
    this.watchdogInterval = setInterval(() => {
      this.checkInstanceHealth();
    }, 30000);
  }

  private async checkInstanceHealth(): Promise<void> {
    const now = new Date();
    
    for (const [instanceId, instance] of this.instances) {
      try {
        // Check for inactivity
        const inactivitySeconds = (now.getTime() - instance.lastActivity.getTime()) / 1000;
        const lastCheckSeconds = (now.getTime() - instance.lastInactivityCheck.getTime()) / 1000;
        
        // Only check if it's been a while since last check to avoid spam
        if (lastCheckSeconds > 60 && inactivitySeconds > instance.inactivityThreshold) {
          instance.lastInactivityCheck = now;
          
          this.emitEvent(instanceId, 'inactivity_detected', { 
            inactivitySeconds, 
            threshold: instance.inactivityThreshold 
          }, 'warn');
          
          if (instance.config.autoRestart !== false) {
            await this.restartInstance(instanceId, `Inactivity detected: ${Math.floor(inactivitySeconds)}s`);
          }
        }

        // Check output for error patterns
        await this.checkForErrorPatterns(instanceId);
        
      } catch (error) {
        console.warn(`Watchdog error for instance ${instanceId}:`, error);
      }
    }
  }

  private async checkForErrorPatterns(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.output.length === 0) return;

    // Check recent output (last 10 lines) for error patterns
    const recentOutput = instance.output.slice(-10).join(' ');
    
    for (const pattern of instance.errorPatterns) {
      if (recentOutput.includes(pattern)) {
        this.emitEvent(instanceId, 'error_detected', { 
          pattern, 
          output: recentOutput.slice(0, 200) 
        }, 'error');
        
        // Auto-restart if configured
        if (instance.config.autoRestart !== false) {
          await this.restartInstance(instanceId, `Error pattern detected: ${pattern}`);
          break; // Only restart once per check
        }
      }
    }
  }

  async removeInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }

    this.emitEvent(id, 'status_changed', { status: 'stopped' }, 'info');

    // Stop monitoring
    this.stopOutputMonitoring(id);
    this.stopLogMonitoring(id);

    // Kill the window
    try {
      await this.runTmuxCommand(['kill-window', '-t', `${this.sessionName}:${instance.name}`]);
    } catch (error) {
      // Window might already be closed
      console.warn(`Failed to kill window for instance ${id}:`, error);
    }

    this.instances.delete(id);
  }

  async sendPrompt(instanceId: string, prompt: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Check if approval is required
    if (instance.config.requireApproval) {
      instance.status = 'waiting_approval';
      instance.pendingCommand = {
        command: prompt,
        requiresApproval: true,
        timestamp: new Date()
      };
      
      this.emitEvent(instanceId, 'approval_required', { prompt }, 'warn');
      return;
    }

    await this.executePrompt(instanceId, prompt);
  }

  async approveCommand(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.pendingCommand) {
      throw new Error(`No pending command for instance ${instanceId}`);
    }

    const prompt = instance.pendingCommand.command;
    instance.pendingCommand = undefined;
    
    await this.executePrompt(instanceId, prompt);
  }

  async cancelCommand(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.pendingCommand = undefined;
    instance.status = 'idle';
    
    this.emitEvent(instanceId, 'status_changed', { status: 'idle' }, 'info');
  }

  private async executePrompt(instanceId: string, prompt: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // Check if command is in allowlist
    const allowlist = instance.ampSettings?.['amp.commands.allowlist'] || [];
    const isAllowed = allowlist.some(allowed => prompt.toLowerCase().includes(allowed.toLowerCase()));
    
    if (!isAllowed && instance.config.requireApproval) {
      instance.status = 'waiting_approval';
      instance.pendingCommand = {
        command: prompt,
        requiresApproval: true,
        timestamp: new Date()
      };
      
      this.emitEvent(instanceId, 'approval_required', { prompt }, 'warn');
      return;
    }

    // Update instance status
    instance.status = 'running';
    instance.currentPrompt = prompt;
    instance.lastActivity = new Date();
    instance.stats.promptsExecuted++;

    this.emitEvent(instanceId, 'prompt_sent', { prompt: prompt.slice(0, 100) }, 'info');

    // Send the prompt directly to the interactive amp CLI session
    // Split multi-line prompts and send line by line
    const lines = prompt.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Send the line content
      await this.runTmuxCommand([
        'send-keys', 
        '-t', `${this.sessionName}:${instance.name}`, 
        line
      ]);
      
      // If this is not the last line, send Shift+Enter for newline
      // If this is the last line, send Enter to submit
      if (i < lines.length - 1) {
        // For multi-line prompts, use backslash followed by Enter
        await this.runTmuxCommand([
          'send-keys', 
          '-t', `${this.sessionName}:${instance.name}`, 
          ' \\',
          'Enter'
        ]);
      } else {
        // Send Enter to submit the prompt
        await this.runTmuxCommand([
          'send-keys', 
          '-t', `${this.sessionName}:${instance.name}`, 
          'Enter'
        ]);
      }
      
      // Small delay between lines for better reliability
      if (i < lines.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    this.emitEvent(instanceId, 'command_executed', { prompt: prompt.slice(0, 100) }, 'info');
  }

  private startOutputMonitoring(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // Monitor output every 500ms
    const interval = setInterval(async () => {
      try {
        const currentOutput = await this.getInstanceOutput(instanceId);
        const existingInstance = this.instances.get(instanceId);
        
        if (existingInstance) {
          // Only update if output has changed
          const currentLength = existingInstance.output.length;
          const newLength = currentOutput.length;
          
          if (newLength > currentLength) {
            existingInstance.output = currentOutput;
            existingInstance.lastActivity = new Date();
          }
        }
      } catch (error) {
        // Instance might have been removed
        this.stopOutputMonitoring(instanceId);
      }
    }, 500);

    this.outputMonitors.set(instanceId, interval);
  }

  private stopOutputMonitoring(instanceId: string): void {
    const interval = this.outputMonitors.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.outputMonitors.delete(instanceId);
    }
  }

  private startLogMonitoring(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.logFile) return;

    const logMonitor = new AmpLogMonitor(instance.logFile);
    
    // Listen for amp state changes
    logMonitor.on('amp-started', () => {
      const inst = this.instances.get(instanceId);
      if (inst && inst.status !== 'running') {
        inst.status = 'running';
        this.emitEvent(instanceId, 'status_changed', { status: 'running' }, 'info');
      }
    });

    logMonitor.on('amp-idle', () => {
      const inst = this.instances.get(instanceId);
      if (inst && inst.status !== 'idle') {
        inst.status = 'idle';
        inst.currentPrompt = undefined;
        this.emitEvent(instanceId, 'status_changed', { status: 'idle' }, 'info');
      }
    });

    logMonitor.on('state-changed', (data) => {
      const inst = this.instances.get(instanceId);
      if (inst) {
        inst.lastActivity = new Date();
        
        // Update status based on log monitor state
        const newStatus = logMonitor.isRunning() ? 'running' : 'idle';
        if (inst.status !== newStatus) {
          inst.status = newStatus;
          if (newStatus === 'idle') {
            inst.currentPrompt = undefined;
          }
          this.emitEvent(instanceId, 'status_changed', { 
            status: newStatus,
            ampState: data.newState 
          }, 'info');
        }
      }
    });

    logMonitor.on('error', (error) => {
      console.warn(`Log monitor error for instance ${instanceId}:`, error);
    });

    // Start monitoring and refresh initial state
    logMonitor.startMonitoring();
    logMonitor.refreshState();
    
    this.logMonitors.set(instanceId, logMonitor);
  }

  private stopLogMonitoring(instanceId: string): void {
    const logMonitor = this.logMonitors.get(instanceId);
    if (logMonitor) {
      logMonitor.stopMonitoring();
      this.logMonitors.delete(instanceId);
    }
  }

  async getInstanceOutput(instanceId: string): Promise<string[]> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    try {
      // Capture pane content - get more lines to show full conversation
      const output = await this.runTmuxCommand([
        'capture-pane', 
        '-t', `${this.sessionName}:${instance.name}`, 
        '-S', '-50', // Start from 50 lines back
        '-p'
      ]);
      
      return output.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.warn(`Failed to capture output for instance ${instanceId}:`, error);
      return [];
    }
  }

  async listInstances(): Promise<AmpInstance[]> {
    const instances = Array.from(this.instances.values());
    
    // Ensure Date objects are properly maintained
    return instances.map(instance => ({
      ...instance,
      createdAt: instance.createdAt instanceof Date ? instance.createdAt : new Date(instance.createdAt),
      lastActivity: instance.lastActivity instanceof Date ? instance.lastActivity : new Date(instance.lastActivity),
      lastInactivityCheck: instance.lastInactivityCheck instanceof Date ? instance.lastInactivityCheck : new Date(instance.lastInactivityCheck),
      stats: {
        ...instance.stats,
        lastRestart: instance.stats.lastRestart instanceof Date ? instance.stats.lastRestart : 
                     instance.stats.lastRestart ? new Date(instance.stats.lastRestart) : undefined
      },
      pendingCommand: instance.pendingCommand ? {
        ...instance.pendingCommand,
        timestamp: instance.pendingCommand.timestamp instanceof Date ? instance.pendingCommand.timestamp : new Date(instance.pendingCommand.timestamp)
      } : undefined
    }));
  }

  async cleanup(): Promise<void> {
    // Stop watchdog
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    // Stop all monitoring
    for (const instanceId of this.outputMonitors.keys()) {
      this.stopOutputMonitoring(instanceId);
    }
    
    for (const instanceId of this.logMonitors.keys()) {
      this.stopLogMonitoring(instanceId);
    }

    if (this.sessionExists) {
      try {
        await this.runTmuxCommand(['kill-session', '-t', this.sessionName]);
      } catch (error) {
        console.warn('Failed to kill tmux session:', error);
      }
    }
  }

  private buildAmpCommand(instance: AmpInstance): string {
    let command = 'amp';
    
    // Add thread ID if continuing a thread
    if (instance.threadId) {
      command += ` --thread-id ${instance.threadId}`;
    }
    
    // Add log level
    if (instance.config.logLevel) {
      command += ` --log-level ${instance.config.logLevel}`;
    }
    
    // Add log file
    if (instance.logFile) {
      command += ` --log-file ${instance.logFile}`;
    }
    
    // Add notifications setting
    const notificationsEnabled = instance.ampSettings?.['amp.notifications.enabled'];
    if (notificationsEnabled === false) {
      command += ' --no-notifications';
    }
    
    return command;
  }

  private async runTmuxCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('tmux', args, { 
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TMUX: '' } // Ensure we can run tmux commands
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Tmux command failed: ${stderr || stdout}`));
        }
      });

      childProcess.on('error', (error: Error) => {
        reject(error);
      });
    });
  }
} 