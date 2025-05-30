# Monitoring Specification

## Health Monitoring

### Instance Status Tracking
- `idle`: No active operations
- `running`: Executing commands
- `error`: Error state detected
- `waiting_approval`: Pending command approval
- `authenticating`: Authentication in progress

### Authentication Monitoring
- Separate from general status
- Real-time auth state detection
- Token expiry tracking
- Re-authentication prompts

### Activity Monitoring
- Last activity timestamps
- Inactivity threshold enforcement
- Auto-restart triggers
- Uptime tracking

## Log Monitoring

### AmpLogMonitor Service
```typescript
interface LogState {
  state: 'awaiting-user-message' | 'awaiting-agent' | 'checking-agent-file';
  lastActivity: Date;
  errorPatterns: string[];
}
```

### Error Detection
- Pattern matching on output
- Common error scenarios:
  - Authentication failures
  - Credit exhaustion
  - Context limit exceeded
  - Network timeouts

### Real-time Parsing
- Continuous log file monitoring
- State extraction from amp output
- Event emission for state changes

## Watchdog System

### Inactivity Detection
- Configurable timeout per instance
- Automatic restart on timeout
- Visual indicators for inactive instances

### Auto-restart Logic
- Health-based restart decisions
- Error pattern triggered restarts
- Manual restart capabilities
- Restart count tracking

### Configuration
```typescript
interface WatchdogConfig {
  inactivityThreshold: number;
  errorPatterns: string[];
  autoRestart: boolean;
  requireApproval: boolean;
}
```
