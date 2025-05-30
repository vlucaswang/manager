import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AmpLogMonitor } from '../src/services/AmpLogMonitor.js';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';

// Mock fs module
mock.module('fs', () => ({
  promises: {
    access: mock(),
    stat: mock(),
    readFile: mock(),
    watchFile: mock(),
    unwatchFile: mock()
  }
}));

describe('AmpLogMonitor', () => {
  let logMonitor: AmpLogMonitor;
  let mockCallback: ReturnType<typeof mock>;

  beforeEach(() => {
    mockCallback = mock();
    logMonitor = new AmpLogMonitor('test-instance', '/tmp/test.log');
  });

  afterEach(() => {
    logMonitor.stop();
  });

  test('should initialize with instance ID and log path', () => {
    expect(logMonitor).toBeDefined();
  });

  test('should emit events when log state changes', () => {
    logMonitor.on('state-change', mockCallback);

    // Simulate state change
    logMonitor['emitStateChange']('awaiting-user-message');

    expect(mockCallback).toHaveBeenCalledWith('awaiting-user-message');
  });

  test('should parse JSON log entries correctly', () => {
    const logEntry = JSON.stringify({
      level: 'info',
      message: 'awaiting-user-message',
      timestamp: new Date().toISOString()
    });

    const parsed = logMonitor['parseLogEntry'](logEntry);

    expect(parsed).toEqual({
      level: 'info',
      message: 'awaiting-user-message',
      timestamp: expect.any(String)
    });
  });

  test('should handle malformed JSON gracefully', () => {
    const malformedEntry = 'invalid json {';
    
    const parsed = logMonitor['parseLogEntry'](malformedEntry);
    
    expect(parsed).toBeNull();
  });

  test('should detect inference states from log messages', () => {
    logMonitor.on('state-change', mockCallback);

    const awaitingUserLog = JSON.stringify({
      message: 'awaiting-user-message',
      level: 'info'
    });

    const awaitingAgentLog = JSON.stringify({
      message: 'awaiting-agent',
      level: 'info'
    });

    logMonitor['processLogEntry'](awaitingUserLog);
    logMonitor['processLogEntry'](awaitingAgentLog);

    expect(mockCallback).toHaveBeenCalledWith('awaiting-user-message');
    expect(mockCallback).toHaveBeenCalledWith('awaiting-agent');
  });

  test('should emit activity events on valid log entries', () => {
    logMonitor.on('activity', mockCallback);

    const logEntry = JSON.stringify({
      level: 'info',
      message: 'test activity',
      timestamp: new Date().toISOString()
    });

    logMonitor['processLogEntry'](logEntry);

    expect(mockCallback).toHaveBeenCalled();
  });

  test('should track last activity timestamp', () => {
    const initialActivity = logMonitor.getLastActivity();
    
    // Simulate log activity
    const logEntry = JSON.stringify({
      level: 'info',
      message: 'test',
      timestamp: new Date().toISOString()
    });

    logMonitor['processLogEntry'](logEntry);
    
    const newActivity = logMonitor.getLastActivity();
    expect(newActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
  });

  test('should handle file watching lifecycle', async () => {
    // Mock file exists
    (fs.access as any).mockResolvedValue(undefined);
    (fs.stat as any).mockResolvedValue({ mtime: new Date(), size: 0 });

    logMonitor.start();
    expect(logMonitor.isRunning()).toBe(true);

    logMonitor.stop();
    expect(logMonitor.isRunning()).toBe(false);
  });

  test('should detect error patterns in logs', () => {
    logMonitor.on('error-detected', mockCallback);

    const errorLog = JSON.stringify({
      level: 'error',
      message: 'authentication failed',
      timestamp: new Date().toISOString()
    });

    logMonitor['processLogEntry'](errorLog);

    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: 'authentication failed',
        entry: expect.any(Object)
      })
    );
  });

  test('should provide current state information', () => {
    // Initial state should be unknown
    expect(logMonitor.getCurrentState()).toBe('unknown');

    // Simulate state change
    logMonitor['emitStateChange']('awaiting-agent');
    expect(logMonitor.getCurrentState()).toBe('awaiting-agent');
  });

  test('should handle concurrent log processing', () => {
    const entries = [
      JSON.stringify({ message: 'entry1', level: 'info' }),
      JSON.stringify({ message: 'entry2', level: 'info' }),
      JSON.stringify({ message: 'entry3', level: 'info' })
    ];

    logMonitor.on('activity', mockCallback);

    entries.forEach(entry => {
      logMonitor['processLogEntry'](entry);
    });

    expect(mockCallback).toHaveBeenCalledTimes(3);
  });

  test('should validate log file path', () => {
    expect(() => {
      new AmpLogMonitor('test', '');
    }).toThrow('Log file path is required');

    expect(() => {
      new AmpLogMonitor('', '/valid/path');
    }).toThrow('Instance ID is required');
  });

  test('should emit inference events for amp CLI states', () => {
    logMonitor.on('inference-state', mockCallback);

    const inferenceLog = JSON.stringify({
      message: 'checking-agent-file',
      level: 'debug',
      timestamp: new Date().toISOString()
    });

    logMonitor['processLogEntry'](inferenceLog);

    expect(mockCallback).toHaveBeenCalledWith('checking-agent-file');
  });
});
