import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';

export interface AmpState {
  type: 'awaiting-user-message' | 'awaiting-agent' | 'checking-agent-file' | 'initial' | 'unknown';
  statusMessage?: string;
  inferenceState?: 'idle' | 'running';
  lastActivity: Date;
}

export interface AmpLogEvent {
  timestamp: Date;
  level: string;
  message: string;
  data?: any;
}

export class AmpLogMonitor extends EventEmitter {
  private logFile: string;
  private isMonitoring = false;
  private currentState: AmpState = {
    type: 'unknown',
    lastActivity: new Date()
  };
  private lastLogPosition = 0;
  private monitorInterval?: NodeJS.Timeout;

  constructor(logFile: string) {
    super();
    this.logFile = logFile;
  }

  getCurrentState(): AmpState {
    return { ...this.currentState };
  }

  isRunning(): boolean {
    // Consider running if:
    // 1. Currently awaiting agent response
    // 2. Has recent activity (within last 10 seconds) and not explicitly idle
    const now = new Date();
    const timeSinceActivity = now.getTime() - this.currentState.lastActivity.getTime();
    
    return this.currentState.type === 'awaiting-agent' || 
           this.currentState.statusMessage === 'Thinking...' ||
           (timeSinceActivity < 10000 && this.currentState.type !== 'awaiting-user-message');
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Reset position if file doesn't exist yet
    if (!existsSync(this.logFile)) {
      this.lastLogPosition = 0;
    } else {
      // Start from end of existing file
      const stats = await fs.stat(this.logFile);
      this.lastLogPosition = stats.size;
    }

    // Monitor every 500ms for responsive state detection
    this.monitorInterval = setInterval(() => {
      this.checkForLogUpdates().catch(error => {
        this.emit('error', error);
      });
    }, 500);

    this.emit('monitoring-started');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    this.emit('monitoring-stopped');
  }

  private async checkForLogUpdates(): Promise<void> {
    if (!existsSync(this.logFile)) {
      return;
    }

    try {
      const stats = await fs.stat(this.logFile);
      
      // Check if file has grown
      if (stats.size > this.lastLogPosition) {
        const newContent = await this.readNewLogContent(stats.size);
        if (newContent) {
          this.parseLogContent(newContent);
        }
      }
    } catch (error) {
      // File might be temporarily unavailable, ignore
    }
  }

  private async readNewLogContent(currentSize: number): Promise<string | null> {
    try {
      const buffer = Buffer.alloc(currentSize - this.lastLogPosition);
      const fd = await fs.open(this.logFile, 'r');
      
      try {
        await fd.read(buffer, 0, buffer.length, this.lastLogPosition);
        this.lastLogPosition = currentSize;
        return buffer.toString('utf8');
      } finally {
        await fd.close();
      }
    } catch (error) {
      return null;
    }
  }

  private parseLogContent(content: string): void {
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line) as AmpLogEvent;
        this.processLogEntry(logEntry);
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }
  }

  private processLogEntry(entry: AmpLogEvent): void {
    const oldState = { ...this.currentState };
    
    // Update last activity timestamp
    this.currentState.lastActivity = new Date(entry.timestamp);
    
    // Parse state transitions from log messages - handle the actual amp log format
    const message = entry.message;
    
    // Look for state transition messages like "awaiting-user-message + submit -> awaiting-agent"
    const stateTransitionMatch = message.match(/(\w+[-\w]*)\s*\+\s*[\w-]+\s*->\s*(\w+[-\w]*)/);
    if (stateTransitionMatch) {
      const newState = stateTransitionMatch[2];
      if (newState === 'awaiting-user-message') {
        this.currentState.type = 'awaiting-user-message';
        this.currentState.statusMessage = undefined;
      } else if (newState === 'awaiting-agent') {
        this.currentState.type = 'awaiting-agent';
        this.currentState.statusMessage = 'Thinking...';
      } else if (newState === 'checking-agent-file') {
        this.currentState.type = 'checking-agent-file';
      }
    }
    
    // Also check for direct state mentions
    if (message.includes('awaiting-user-message') || message.includes('ready for input')) {
      this.currentState.type = 'awaiting-user-message';
      this.currentState.statusMessage = undefined;
    } else if (message.includes('awaiting-agent') || message.includes('processing')) {
      this.currentState.type = 'awaiting-agent';
      this.currentState.statusMessage = 'Thinking...';
    } else if (message.includes('checking-agent-file')) {
      this.currentState.type = 'checking-agent-file';
    } else if (message.includes('initial') || message.includes('started')) {
      this.currentState.type = 'initial';
    }

    // Look for specific amp prompts and responses
    if (message.includes('Type') && message.includes('Enter')) {
      this.currentState.type = 'awaiting-user-message';
      this.currentState.statusMessage = 'Ready for input';
    } else if (message.includes('Interrupt') && message.includes('Ctrl+C')) {
      this.currentState.type = 'awaiting-user-message';
      this.currentState.statusMessage = 'Ready for input';
    }

    // Look for status messages in nested object structure
    if (entry.data && typeof entry.data === 'object') {
      if ('statusMessage' in entry.data) {
        this.currentState.statusMessage = String(entry.data.statusMessage);
      }
      
      // Look for nested event data that might contain status info
      if ('event' in entry.data && typeof entry.data.event === 'object' && entry.data.event) {
        const eventData = entry.data.event as any;
        if ('statusMessage' in eventData) {
          this.currentState.statusMessage = String(eventData.statusMessage);
        }
      }
    }

    // Extract inference state from worker-state messages
    if (message.includes('worker-state')) {
      try {
        // Look for inferenceState in the entire log entry
        const entryStr = JSON.stringify(entry);
        const inferenceMatch = entryStr.match(/"inferenceState":"([^"]+)"/);
        if (inferenceMatch) {
          this.currentState.inferenceState = inferenceMatch[1] as 'idle' | 'running';
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    // Special handling for user message processing
    if (message.includes('Processing user message:') || message.includes('received user input')) {
      this.currentState.type = 'awaiting-agent';
      this.currentState.statusMessage = 'Processing...';
    }

    // Handle completion indicators
    if (message.includes('completed') || message.includes('finished')) {
      this.currentState.type = 'awaiting-user-message';
      this.currentState.statusMessage = 'Ready for input';
    }

    // Emit state change event if state actually changed
    if (this.hasStateChanged(oldState, this.currentState)) {
      this.emit('state-changed', {
        oldState,
        newState: { ...this.currentState },
        logEntry: entry
      });
    }

    // Emit specific events for easier handling
    if (this.isRunning() !== this.wasRunning(oldState)) {
      this.emit(this.isRunning() ? 'amp-started' : 'amp-idle');
    }
  }

  private hasStateChanged(oldState: AmpState, newState: AmpState): boolean {
    return oldState.type !== newState.type ||
           oldState.statusMessage !== newState.statusMessage ||
           oldState.inferenceState !== newState.inferenceState;
  }

  private wasRunning(state: AmpState): boolean {
    const now = new Date();
    const timeSinceActivity = now.getTime() - state.lastActivity.getTime();
    
    return state.type === 'awaiting-agent' || 
           state.statusMessage === 'Thinking...' ||
           (timeSinceActivity < 10000 && state.type !== 'awaiting-user-message');
  }

  // Public method to force a state check (useful for initial state detection)
  async refreshState(): Promise<void> {
    if (!existsSync(this.logFile)) {
      return;
    }

    try {
      // Read the last few lines to get current state
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim()).slice(-10);
      
      this.currentState = {
        type: 'unknown',
        lastActivity: new Date()
      };
      
      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line) as AmpLogEvent;
          this.processLogEntry(logEntry);
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Ignore errors, keep current state
    }
  }
}
