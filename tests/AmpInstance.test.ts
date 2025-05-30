import { describe, test, expect } from 'bun:test';
import { AmpInstance, InstanceConfig, ControlMessage, ControlResponse, AgentEvent } from '../src/types/AmpInstance.js';

describe('AmpInstance Types', () => {
  test('should create valid AmpInstance', () => {
    const instance: AmpInstance = {
      id: 'test-123',
      name: 'Test Instance',
      tmuxPane: 'amp-manager:0',
      status: 'idle',
      createdAt: new Date(),
      lastActivity: new Date(),
      lastInactivityCheck: new Date(),
      workingDirectory: '/tmp',
      logFile: '/tmp/amp.log',
      output: ['test output'],
      threadId: 'thread-abc',
      authStatus: 'authenticated',
      stats: {
        promptsExecuted: 5,
        tokensUsed: 1000,
        uptime: 3600,
        restartCount: 0
      },
      config: {
        name: 'Test Instance',
        autoRestart: true,
        inactivityThreshold: 300
      },
      errorPatterns: ['error', 'failed'],
      inactivityThreshold: 300
    };

    expect(instance.id).toBe('test-123');
    expect(instance.status).toBe('idle');
    expect(instance.authStatus).toBe('authenticated');
    expect(instance.stats.promptsExecuted).toBe(5);
  });

  test('should create valid InstanceConfig', () => {
    const config: InstanceConfig = {
      name: 'Production Agent',
      workingDirectory: '/app',
      initialPrompt: 'Hello, I am ready to help',
      environment: {
        NODE_ENV: 'production',
        DEBUG: 'false'
      },
      autoRestart: true,
      inactivityThreshold: 600,
      requireApproval: true,
      errorPatterns: ['auth failed', 'timeout'],
      logLevel: 'info',
      threadId: 'existing-thread-123',
      ampSettings: {
        'amp.notifications.enabled': true,
        'amp.commands.allowlist': ['git status', 'npm test'],
        'amp.tools.disable': ['browser_navigate']
      },
      commandAllowlist: ['git', 'npm', 'ls']
    };

    expect(config.name).toBe('Production Agent');
    expect(config.autoRestart).toBe(true);
    expect(config.ampSettings?.['amp.notifications.enabled']).toBe(true);
    expect(config.commandAllowlist).toContain('git');
  });

  test('should validate required instance fields', () => {
    const instance: AmpInstance = {
      id: 'req-test',
      name: 'Required Test',
      tmuxPane: 'test:0',
      status: 'running',
      createdAt: new Date(),
      lastActivity: new Date(),
      lastInactivityCheck: new Date(),
      output: [],
      authStatus: 'pending',
      stats: {
        promptsExecuted: 0,
        tokensUsed: 0,
        uptime: 0,
        restartCount: 0
      },
      config: {},
      errorPatterns: [],
      inactivityThreshold: 300
    };

    // Required fields should be present
    expect(instance.id).toBeDefined();
    expect(instance.name).toBeDefined();
    expect(instance.tmuxPane).toBeDefined();
    expect(instance.status).toBeDefined();
    expect(instance.authStatus).toBeDefined();
  });

  test('should handle pending commands correctly', () => {
    const instance: AmpInstance = {
      id: 'pending-test',
      name: 'Pending Test',
      tmuxPane: 'test:1',
      status: 'waiting_approval',
      createdAt: new Date(),
      lastActivity: new Date(),
      lastInactivityCheck: new Date(),
      output: [],
      authStatus: 'authenticated',
      pendingCommand: {
        command: 'rm -rf /dangerous/path',
        requiresApproval: true,
        timestamp: new Date()
      },
      stats: {
        promptsExecuted: 0,
        tokensUsed: 0,
        uptime: 0,
        restartCount: 0
      },
      config: {
        requireApproval: true
      },
      errorPatterns: [],
      inactivityThreshold: 300
    };

    expect(instance.status).toBe('waiting_approval');
    expect(instance.pendingCommand?.requiresApproval).toBe(true);
    expect(instance.pendingCommand?.command).toContain('rm -rf');
  });

  test('should create valid ControlMessage', () => {
    const message: ControlMessage = {
      type: 'create_instance',
      payload: {
        name: 'New Instance',
        workingDirectory: '/workspace'
      },
      requestId: 'req-456'
    };

    expect(message.type).toBe('create_instance');
    expect(message.payload.name).toBe('New Instance');
    expect(message.requestId).toBe('req-456');
  });

  test('should create valid ControlResponse', () => {
    const response: ControlResponse = {
      success: true,
      data: {
        instanceId: 'new-instance-123',
        status: 'created'
      },
      requestId: 'req-456'
    };

    expect(response.success).toBe(true);
    expect(response.data.instanceId).toBe('new-instance-123');
    expect(response.requestId).toBe('req-456');
  });

  test('should create error ControlResponse', () => {
    const errorResponse: ControlResponse = {
      success: false,
      error: 'Instance not found',
      requestId: 'req-789'
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe('Instance not found');
    expect(errorResponse.data).toBeUndefined();
  });

  test('should create valid AgentEvent', () => {
    const event: AgentEvent = {
      instanceId: 'event-test-123',
      timestamp: new Date(),
      type: 'prompt_sent',
      data: {
        prompt: 'Test prompt',
        threadId: 'thread-abc'
      },
      severity: 'info'
    };

    expect(event.instanceId).toBe('event-test-123');
    expect(event.type).toBe('prompt_sent');
    expect(event.severity).toBe('info');
    expect(event.data.prompt).toBe('Test prompt');
  });

  test('should validate AmpSettings structure', () => {
    const settings = {
      'amp.notifications.enabled': true,
      'amp.mcpServers': {
        'filesystem': {
          command: 'mcp-filesystem',
          args: ['--root', '/workspace']
        }
      },
      'amp.mcp.disable': ['dangerous-server'],
      'amp.tools.disable': ['browser_navigate', 'file_delete'],
      'amp.commands.allowlist': ['git status', 'npm test', 'ls -la']
    };

    // Validate structure matches AmpSettings interface
    expect(typeof settings['amp.notifications.enabled']).toBe('boolean');
    expect(Array.isArray(settings['amp.mcp.disable'])).toBe(true);
    expect(Array.isArray(settings['amp.tools.disable'])).toBe(true);
    expect(Array.isArray(settings['amp.commands.allowlist'])).toBe(true);
    expect(typeof settings['amp.mcpServers']).toBe('object');
  });

  test('should handle all status types', () => {
    const statuses: AmpInstance['status'][] = [
      'idle',
      'running', 
      'error',
      'stopped',
      'waiting_approval',
      'authenticating'
    ];

    statuses.forEach(status => {
      const instance: Partial<AmpInstance> = { status };
      expect(['idle', 'running', 'error', 'stopped', 'waiting_approval', 'authenticating'])
        .toContain(instance.status);
    });
  });

  test('should handle all auth status types', () => {
    const authStatuses: AmpInstance['authStatus'][] = [
      'authenticated',
      'pending',
      'failed', 
      'unknown'
    ];

    authStatuses.forEach(authStatus => {
      const instance: Partial<AmpInstance> = { authStatus };
      expect(['authenticated', 'pending', 'failed', 'unknown'])
        .toContain(instance.authStatus);
    });
  });
});
