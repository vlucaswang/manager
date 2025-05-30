import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ControlSocket } from '../src/services/ControlSocket.js';
import { TmuxManager } from '../src/services/TmuxManager.js';
import { WebSocket } from 'ws';

// Mock WebSocket
mock.module('ws', () => ({
  WebSocketServer: mock().mockImplementation(() => ({
    on: mock(),
    clients: new Set(),
    close: mock()
  })),
  WebSocket: mock()
}));

describe('ControlSocket', () => {
  let controlSocket: ControlSocket;
  let mockTmuxManager: TmuxManager;

  beforeEach(() => {
    mockTmuxManager = new TmuxManager('test-session');
    controlSocket = new ControlSocket(8081, mockTmuxManager);
  });

  afterEach(async () => {
    await controlSocket.close();
    await mockTmuxManager.cleanup();
  });

  test('should initialize with port and tmux manager', () => {
    expect(controlSocket).toBeDefined();
  });

  test('should handle create_instance command', async () => {
    const message = {
      type: 'create_instance',
      payload: {
        name: 'test-instance',
        workingDirectory: '/tmp'
      },
      requestId: 'test-123'
    };

    const mockSend = mock();
    const mockClient = { send: mockSend } as any;

    // Simulate message handling
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(true);
    expect(response.requestId).toBe('test-123');
    expect(response.data).toHaveProperty('id');
  });

  test('should handle list_instances command', async () => {
    // Create a test instance first
    await mockTmuxManager.createInstance({ name: 'list-test' });

    const message = {
      type: 'list_instances',
      payload: {},
      requestId: 'list-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('instances');
    expect(Array.isArray(response.data.instances)).toBe(true);
  });

  test('should handle get_status command', async () => {
    const message = {
      type: 'get_status',
      payload: {},
      requestId: 'status-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('instanceCount');
    expect(response.data).toHaveProperty('runningCount');
    expect(response.data).toHaveProperty('instances');
  });

  test('should handle send_prompt command', async () => {
    // Create instance first
    const instance = await mockTmuxManager.createInstance({ name: 'prompt-test' });

    const message = {
      type: 'send_prompt',
      payload: {
        instanceId: instance.id,
        prompt: 'test prompt'
      },
      requestId: 'prompt-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(true);
    expect(response.requestId).toBe('prompt-123');
  });

  test('should handle approve_command', async () => {
    const instance = await mockTmuxManager.createInstance({ 
      name: 'approval-test',
      requireApproval: true 
    });
    
    // Set up pending command
    instance.pendingCommand = {
      command: 'test command',
      requiresApproval: true,
      timestamp: new Date()
    };
    instance.status = 'waiting_approval';

    const message = {
      type: 'approve_command',
      payload: { instanceId: instance.id },
      requestId: 'approve-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(true);
  });

  test('should handle invalid commands gracefully', async () => {
    const message = {
      type: 'invalid_command',
      payload: {},
      requestId: 'invalid-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown command type');
  });

  test('should validate required payload fields', async () => {
    const message = {
      type: 'send_prompt',
      payload: {
        // Missing instanceId and prompt
      },
      requestId: 'validation-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](message, mockClient);

    expect(response.success).toBe(false);
    expect(response.error).toContain('instanceId');
  });

  test('should handle thread management commands', async () => {
    const instance = await mockTmuxManager.createInstance({ name: 'thread-test' });

    const createThreadMessage = {
      type: 'create_thread',
      payload: { instanceId: instance.id },
      requestId: 'thread-123'
    };

    const mockClient = { send: mock() } as any;
    const response = await controlSocket['handleMessage'](createThreadMessage, mockClient);

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('threadId');
  });

  test('should broadcast agent events to clients', () => {
    const mockClient1 = { send: mock(), readyState: 1 } as any;
    const mockClient2 = { send: mock(), readyState: 1 } as any;
    
    // Simulate clients
    controlSocket['clients'].add(mockClient1);
    controlSocket['clients'].add(mockClient2);

    const event = {
      instanceId: 'test-instance',
      timestamp: new Date(),
      type: 'prompt_sent' as const,
      data: { prompt: 'test' },
      severity: 'info' as const
    };

    controlSocket['broadcastEvent'](event);

    expect(mockClient1.send).toHaveBeenCalled();
    expect(mockClient2.send).toHaveBeenCalled();
  });
});
