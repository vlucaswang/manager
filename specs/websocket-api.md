# WebSocket API Specification

## Overview
Real-time control and monitoring API via WebSocket connection on port 8080.

## Connection
- Server listens on configurable port (default 8080)
- JSON message protocol
- Real-time bidirectional communication
- Multiple client support

## Message Format

### Request Message
```typescript
interface ControlMessage {
  type: string;
  payload: any;
  requestId?: string;
}
```

### Response Message
```typescript
interface ControlResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
}
```

## Command Types

### Instance Management
- `create_instance`: Create new amp instance
- `destroy_instance`: Terminate instance
- `restart_instance`: Restart existing instance
- `list_instances`: Get all instances status

### Prompt Operations
- `send_prompt`: Send command to instance
- `get_agent_stream`: Stream real-time output

### Security Commands
- `approve_command`: Approve pending command
- `cancel_command`: Reject pending command

### Thread Management
- `create_thread`: Generate new conversation thread
- `switch_thread`: Change active thread
- `list_threads`: Show available threads
- `fork_thread`: Create branch from existing thread

### Settings Operations
- `update_settings`: Modify instance configuration
- `toggle_auto_restart`: Change auto-restart setting
- `set_global_auto_restart`: Global auto-restart default

### Monitoring
- `get_status`: Comprehensive system status
- `get_tools`: Available amp CLI tools
- `configure_watchdog`: Update monitoring settings

## Event Streaming

### Agent Events
```typescript
interface AgentEvent {
  instanceId: string;
  timestamp: Date;
  type: 'prompt_sent' | 'command_executed' | 'error_detected' | 
        'restart_triggered' | 'approval_required' | 'status_changed';
  data: any;
  severity: 'info' | 'warn' | 'error' | 'critical';
}
```

### Real-time Updates
- Instance status changes
- Authentication events
- Command approvals
- Error notifications
- Activity monitoring
