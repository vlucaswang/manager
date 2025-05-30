import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { TmuxManager } from '../src/services/TmuxManager.js';
import { AmpInstance, InstanceConfig } from '../src/types/AmpInstance.js';
import { spawn } from 'child_process';

// Mock child_process
mock.module('child_process', () => ({
  spawn: mock(() => ({
    stdout: { on: mock() },
    stderr: { on: mock() },
    on: mock(),
    kill: mock()
  }))
}));

describe('TmuxManager', () => {
  let tmuxManager: TmuxManager;
  let mockCallback: ReturnType<typeof mock>;

  beforeEach(() => {
    mockCallback = mock();
    tmuxManager = new TmuxManager('test-session');
  });

  afterEach(async () => {
    await tmuxManager.cleanup();
  });

  test('should initialize with session name', () => {
    expect(tmuxManager).toBeDefined();
  });

  test('should create instance with valid config', async () => {
    const config: InstanceConfig = {
      name: 'test-instance',
      workingDirectory: '/tmp',
      autoRestart: true
    };

    const instance = await tmuxManager.createInstance(config);
    
    expect(instance).toBeDefined();
    expect(instance.name).toBe('test-instance');
    expect(instance.config.workingDirectory).toBe('/tmp');
    expect(instance.config.autoRestart).toBe(true);
    expect(instance.status).toBe('idle');
    expect(instance.authStatus).toBe('unknown');
  });

  test('should generate unique instance IDs', async () => {
    const config1: InstanceConfig = { name: 'instance1' };
    const config2: InstanceConfig = { name: 'instance2' };

    const instance1 = await tmuxManager.createInstance(config1);
    const instance2 = await tmuxManager.createInstance(config2);

    expect(instance1.id).not.toBe(instance2.id);
  });

  test('should handle instance configuration defaults', async () => {
    const config: InstanceConfig = {};

    const instance = await tmuxManager.createInstance(config);

    expect(instance.config.autoRestart).toBe(false);
    expect(instance.config.inactivityThreshold).toBe(300);
    expect(instance.config.requireApproval).toBe(false);
    expect(instance.errorPatterns).toEqual([
      'authentication failed',
      'out of free credits', 
      'exceed context limit',
      'timeout'
    ]);
  });

  test('should track instance statistics', async () => {
    const config: InstanceConfig = { name: 'stats-test' };
    const instance = await tmuxManager.createInstance(config);

    expect(instance.stats.promptsExecuted).toBe(0);
    expect(instance.stats.tokensUsed).toBe(0);
    expect(instance.stats.uptime).toBe(0);
    expect(instance.stats.restartCount).toBe(0);
  });

  test('should handle amp settings configuration', async () => {
    const config: InstanceConfig = {
      name: 'settings-test',
      ampSettings: {
        'amp.notifications.enabled': true,
        'amp.commands.allowlist': ['git status', 'ls'],
        'amp.tools.disable': ['browser_navigate']
      }
    };

    const instance = await tmuxManager.createInstance(config);

    expect(instance.config.ampSettings).toEqual({
      'amp.notifications.enabled': true,
      'amp.commands.allowlist': ['git status', 'ls'],
      'amp.tools.disable': ['browser_navigate']
    });
  });

  test('should emit events on instance creation', async () => {
    tmuxManager.on('instance-created', mockCallback);
    
    const config: InstanceConfig = { name: 'event-test' };
    await tmuxManager.createInstance(config);

    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'event-test',
        status: 'idle'
      })
    );
  });

  test('should handle approval workflow', async () => {
    const config: InstanceConfig = { 
      name: 'approval-test',
      requireApproval: true
    };
    
    const instance = await tmuxManager.createInstance(config);
    
    // Simulate pending command
    instance.pendingCommand = {
      command: 'rm -rf /',
      requiresApproval: true,
      timestamp: new Date()
    };
    instance.status = 'waiting_approval';

    expect(instance.status).toBe('waiting_approval');
    expect(instance.pendingCommand?.command).toBe('rm -rf /');
  });

  test('should validate configuration parameters', async () => {
    const invalidConfig: InstanceConfig = {
      name: '', // Empty name should get default
      inactivityThreshold: -1, // Invalid threshold
      workingDirectory: '/nonexistent/path'
    };

    const instance = await tmuxManager.createInstance(invalidConfig);

    // Should apply defaults for invalid values
    expect(instance.name).toMatch(/^Instance-/);
    expect(instance.config.inactivityThreshold).toBe(300); // Default
  });
});
