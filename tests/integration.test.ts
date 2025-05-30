import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TmuxManager } from '../src/services/TmuxManager.js';
import { ControlSocket } from '../src/services/ControlSocket.js';
import { InstanceConfig } from '../src/types/AmpInstance.js';

describe('Integration Tests', () => {
  let tmuxManager: TmuxManager;
  let controlSocket: ControlSocket;

  beforeEach(() => {
    tmuxManager = new TmuxManager('integration-test');
    controlSocket = new ControlSocket(8082, tmuxManager);
  });

  afterEach(async () => {
    await controlSocket.close();
    await tmuxManager.cleanup();
  });

  test('should create and manage instance through WebSocket API', async () => {
    // Create instance via API
    const createMessage = {
      type: 'create_instance',
      payload: {
        name: 'Integration Test Instance',
        workingDirectory: '/tmp',
        autoRestart: true
      },
      requestId: 'integration-001'
    };

    const mockClient = { send: () => {} } as any;
    const createResponse = await controlSocket['handleMessage'](createMessage, mockClient);

    expect(createResponse.success).toBe(true);
    expect(createResponse.data).toHaveProperty('id');

    const instanceId = createResponse.data.id;

    // Get status via API
    const statusMessage = {
      type: 'get_status',
      payload: {},
      requestId: 'integration-002'
    };

    const statusResponse = await controlSocket['handleMessage'](statusMessage, mockClient);
    
    expect(statusResponse.success).toBe(true);
    expect(statusResponse.data.instanceCount).toBe(1);
    expect(statusResponse.data.instances).toHaveLength(1);
    expect(statusResponse.data.instances[0].id).toBe(instanceId);

    // Send prompt via API
    const promptMessage = {
      type: 'send_prompt',
      payload: {
        instanceId: instanceId,
        prompt: 'Hello, integration test!'
      },
      requestId: 'integration-003'
    };

    const promptResponse = await controlSocket['handleMessage'](promptMessage, mockClient);
    expect(promptResponse.success).toBe(true);

    // List instances via API
    const listMessage = {
      type: 'list_instances',
      payload: {},
      requestId: 'integration-004'
    };

    const listResponse = await controlSocket['handleMessage'](listMessage, mockClient);
    expect(listResponse.success).toBe(true);
    expect(listResponse.data.instances).toHaveLength(1);

    // Destroy instance via API
    const destroyMessage = {
      type: 'destroy_instance',
      payload: { instanceId: instanceId },
      requestId: 'integration-005'
    };

    const destroyResponse = await controlSocket['handleMessage'](destroyMessage, mockClient);
    expect(destroyResponse.success).toBe(true);
  });

  test('should handle approval workflow end-to-end', async () => {
    // Create instance with approval required
    const config: InstanceConfig = {
      name: 'Approval Test',
      requireApproval: true,
      commandAllowlist: ['git status'] // Limited allowlist
    };

    const instance = await tmuxManager.createInstance(config);

    // Simulate command requiring approval
    instance.pendingCommand = {
      command: 'rm -rf /',
      requiresApproval: true,
      timestamp: new Date()
    };
    instance.status = 'waiting_approval';

    // Approve via API
    const approveMessage = {
      type: 'approve_command',
      payload: { instanceId: instance.id },
      requestId: 'approval-001'
    };

    const mockClient = { send: () => {} } as any;
    const approveResponse = await controlSocket['handleMessage'](approveMessage, mockClient);

    expect(approveResponse.success).toBe(true);
    expect(instance.pendingCommand).toBeUndefined();
  });

  test('should handle thread management workflow', async () => {
    const instance = await tmuxManager.createInstance({
      name: 'Thread Test'
    });

    // Create thread via API
    const createThreadMessage = {
      type: 'create_thread',
      payload: { instanceId: instance.id },
      requestId: 'thread-001'
    };

    const mockClient = { send: () => {} } as any;
    const threadResponse = await controlSocket['handleMessage'](createThreadMessage, mockClient);

    expect(threadResponse.success).toBe(true);
    expect(threadResponse.data).toHaveProperty('threadId');

    const threadId = threadResponse.data.threadId;

    // Switch to thread via API
    const switchMessage = {
      type: 'switch_thread',
      payload: { 
        instanceId: instance.id,
        threadId: threadId
      },
      requestId: 'thread-002'
    };

    const switchResponse = await controlSocket['handleMessage'](switchMessage, mockClient);
    expect(switchResponse.success).toBe(true);

    // List threads via API
    const listThreadsMessage = {
      type: 'list_threads',
      payload: { instanceId: instance.id },
      requestId: 'thread-003'
    };

    const listResponse = await controlSocket['handleMessage'](listThreadsMessage, mockClient);
    expect(listResponse.success).toBe(true);
    expect(listResponse.data).toHaveProperty('threads');
  });

  test('should handle settings management', async () => {
    const instance = await tmuxManager.createInstance({
      name: 'Settings Test'
    });

    // Update settings via API
    const updateMessage = {
      type: 'update_settings',
      payload: {
        instanceId: instance.id,
        settings: {
          'amp.notifications.enabled': false,
          'amp.commands.allowlist': ['git', 'npm']
        }
      },
      requestId: 'settings-001'
    };

    const mockClient = { send: () => {} } as any;
    const updateResponse = await controlSocket['handleMessage'](updateMessage, mockClient);

    expect(updateResponse.success).toBe(true);

    // Verify settings were applied
    expect(instance.config.ampSettings?.['amp.notifications.enabled']).toBe(false);
    expect(instance.config.ampSettings?.['amp.commands.allowlist']).toContain('git');
  });

  test('should handle error scenarios gracefully', async () => {
    const mockClient = { send: () => {} } as any;

    // Test invalid instance ID
    const invalidMessage = {
      type: 'send_prompt',
      payload: {
        instanceId: 'nonexistent-id',
        prompt: 'test'
      },
      requestId: 'error-001'
    };

    const errorResponse = await controlSocket['handleMessage'](invalidMessage, mockClient);
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain('not found');

    // Test invalid command type
    const unknownMessage = {
      type: 'unknown_command',
      payload: {},
      requestId: 'error-002'
    };

    const unknownResponse = await controlSocket['handleMessage'](unknownMessage, mockClient);
    expect(unknownResponse.success).toBe(false);
    expect(unknownResponse.error).toContain('Unknown command type');
  });

  test('should maintain instance state consistency', async () => {
    const config: InstanceConfig = {
      name: 'State Test',
      autoRestart: true,
      inactivityThreshold: 60
    };

    const instance = await tmuxManager.createInstance(config);

    // Verify initial state
    expect(instance.status).toBe('idle');
    expect(instance.authStatus).toBe('unknown');
    expect(instance.stats.promptsExecuted).toBe(0);
    expect(instance.stats.restartCount).toBe(0);

    // Verify configuration was applied
    expect(instance.config.autoRestart).toBe(true);
    expect(instance.config.inactivityThreshold).toBe(60);
    expect(instance.inactivityThreshold).toBe(60);

    // Test state changes through tmux manager
    expect(tmuxManager.getInstance(instance.id)).toBeDefined();
    expect(tmuxManager.getAllInstances()).toHaveLength(1);
  });

  test('should handle concurrent operations', async () => {
    const promises = [];

    // Create multiple instances concurrently
    for (let i = 0; i < 3; i++) {
      const promise = tmuxManager.createInstance({
        name: `Concurrent Test ${i}`
      });
      promises.push(promise);
    }

    const instances = await Promise.all(promises);

    expect(instances).toHaveLength(3);
    expect(tmuxManager.getAllInstances()).toHaveLength(3);

    // Verify all have unique IDs
    const ids = instances.map(i => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});
