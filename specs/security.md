# Security Specification

## Command Approval System

### Approval Workflow
1. Command submitted to amp instance
2. Check against allowlist
3. If not allowed, status becomes `waiting_approval`
4. Visual indicators show pending approval
5. User approves (`a`) or rejects (`x`)
6. Command executes or is cancelled

### Configuration
```typescript
interface SecurityConfig {
  requireApproval: boolean;
  commandAllowlist: string[];
  ampSettings: {
    'amp.commands.allowlist': string[];
  };
}
```

### Visual Indicators
- Red/magenta borders for pending approval
- ⚠️ warning icons in instance panels
- Status bar shows approval count

### WebSocket API
- `approve_command`: Approve pending command
- `cancel_command`: Reject pending command

## Security Features

### Command Allowlisting
- Pre-approved safe commands bypass approval
- Configurable per instance
- Git operations, bun commands typically allowed

### Tool Restrictions
- Disable potentially harmful tools
- Browser navigation, file system operations
- Configurable via amp settings

### Audit Logging
- Complete command history
- Timestamps for all approvals/rejections
- Activity tracking per instance
