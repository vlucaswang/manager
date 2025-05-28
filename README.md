# Manager

A visual supervisor and manager for multiple [Amp CLI](https://ampcode.com) instances, providing monitoring, thread management, and enhanced parallel execution features.

### 🧵 **Thread Management** 
- Create and switch between amp CLI threads
- Continue existing conversations across threads
- Thread-aware prompt routing
- Visual thread indicators

### 📁 **File Mention Support**
- Fuzzy file search with `@filename` syntax
- Auto-completion with Tab navigation
- Working directory awareness
- Relative path resolution

### ⚙️ **Settings Management**
- Per-instance amp CLI settings
- Command allowlisting for security
- Tool management and configuration
- Environment variable injection

### 🛡️ **Enhanced Security**
- Command approval workflows
- Configurable allowlists
- Non-interactive mode for better control
- Audit logging of all commands

### 📊 **Advanced Monitoring**
- Authentication status tracking
- Thread activity monitoring
- Enhanced error pattern detection
- Tool usage analytics

## Prerequisites

- Node.js (v22+) - **Required by amp CLI**
- TypeScript
- tmux installed on your system
- **amp CLI tool installed**: `npm install -g @sourcegraph/amp`
- **Authenticated amp CLI**: Run `amp` first to authenticate

## Quick Start

1. **Install amp CLI first:**
   ```bash
   npm install -g @sourcegraph/amp
   ```

2. **Authenticate with amp:**
   ```bash
   amp
   # Follow the authentication flow
   ```

3. **Install and run Amp Manager:**
   ```bash
   git clone <this-repo>
   cd amp-manager
   bun install
   bun run build
   bun start
   ```

## Usage

### 🎮 Controls

#### Dashboard View
- `←` / `→` - Navigate between instances
- `n` - Create new amp instance with authentication
- `d` - Delete selected instance (with confirmation)
- `p` - Send prompt with file mention support
- `r` - Toggle auto-restart for selected instance
- `a` - Approve pending command (when visible)
- `x` - Reject pending command (when visible)
- `s` - Open settings panel
- `Enter` - Open enhanced full-screen view
- `q` - Quit with proper cleanup

#### Full-Screen View
- `p` - Send prompt with `@file` mention support
- `t` - Create new thread for current instance
- `r` - Toggle auto-restart for current instance
- `a` - Approve pending command (when visible)
- `x` - Reject pending command (when visible)
- `↑` / `↓` - Scroll through output history
- `ESC` / `q` - Return to dashboard

#### Settings Panel
- `Tab` - Switch between General and Instance tabs
- `g` - Toggle global auto-restart setting (General tab)
- `r` - Toggle auto-restart for selected instance (Instance tab)
- `e` - Edit configuration values (thresholds)
- `← →` - Navigate instances (Instance tab)
- `ESC` - Close settings panel

#### File Mentions
- Type `@` followed by filename to search files
- `Tab` / `Shift+Tab` - Navigate search results
- `Enter` - Insert selected file reference
- Works in both prompt input and full-screen view

### 🔧 Advanced Configuration

#### Remotely Supervised Instances with Settings

```javascript
const config = {
  name: 'production-agent',
  workingDirectory: '/path/to/project',
  threadId: 'existing-thread-id', // Continue existing thread
  ampSettings: {
    'amp.notifications.enabled': true,
    'amp.commands.allowlist': [
      'git status',
      'git diff',
      'npm test',
      'npm run build'
    ],
    'amp.tools.disable': ['browser_navigate'],
    'amp.mcp.disable': []
  },
  autoRestart: true,
  inactivityThreshold: 300, // 5 minutes
  requireApproval: true,
  errorPatterns: [
    'authentication failed',
    'out of free credits',
    'exceed context limit',
    'timeout'
  ],
  logLevel: 'debug'
};
```

#### Security Features

1. **Command Allowlisting**: Pre-approve safe commands
2. **Approval Workflows**: Manual approval for sensitive operations
3. **Tool Restrictions**: Disable potentially harmful tools
4. **Audit Logging**: Complete command history tracking

### 🔒 Manual Command Approval

When `requireApproval` is enabled or commands are not in the allowlist, amp will request manual approval:

#### Visual Indicators
- **Instance Panels**: Show pending commands with ⚠️ warning
- **Full-Screen View**: Prominent approval interface with instructions
- **Status Changes**: Instance status becomes `waiting_approval`

#### Approval Controls
- **Dashboard**: Press `a` to approve, `x` to reject (when instance selected)
- **Full-Screen**: Press `a` to approve, `x` to reject 
- **WebSocket API**: Send `approve_command` or `cancel_command` messages

#### Approval Workflow
1. **Command Submitted**: User sends prompt that requires approval
2. **Status Change**: Instance status becomes `waiting_approval`
3. **Visual Alert**: Red/magenta border with approval instructions
4. **User Decision**: Approve (`a`) or reject (`x`) the command
5. **Execution**: Approved commands execute immediately, rejected commands are cancelled

#### Example Configuration
```javascript
const config = {
  requireApproval: true,
  commandAllowlist: ['git status', 'ls', 'cat'],
  ampSettings: {
    'amp.commands.allowlist': ['git status', 'ls -la', 'pwd']
  }
};
```

Commands not in the allowlist will require manual approval before execution.

#### Auto-Restart Controls

The manager provides flexible auto-restart controls:

1. **Global Settings**: Press `s` then `g` in the General tab to enable/disable auto-restart for all new instances
2. **Per-Instance Toggle**: Press `r` to toggle auto-restart for the selected instance (works in main view, full-screen, or settings)
3. **Settings Panel**: Press `s` to open comprehensive settings with editable configuration values
4. **Visual Indicators**: 
   - Each instance panel shows individual auto-restart status with color coding
   - Settings panel shows both global defaults and per-instance overrides
   - Green = Enabled, Red = Disabled

**Configuration Options:**
- **Default Inactivity Threshold**: 10-3600 seconds (editable in settings)
- **Global Auto-restart Default**: Applied to new instances
- **Per-Instance Overrides**: Individual timeout and auto-restart settings

**Auto-restart triggers:**
- Instance inactivity (configurable threshold per instance)
- Error pattern detection
- Manual restart requests
- Network failures and timeouts

#### Thread Management

```bash
# Create new thread
t (in full-screen view)

# Switch threads via WebSocket API
{
  "type": "switch_thread",
  "payload": {
    "instanceId": "instance-id",
    "threadId": "thread-id"
  }
}
```

### 🌐 WebSocket API (Enhanced)

#### New Commands

```javascript
// Thread Management
{ "type": "create_thread", "payload": { "instanceId": "..." } }
{ "type": "switch_thread", "payload": { "instanceId": "...", "threadId": "..." } }
{ "type": "list_threads", "payload": { "instanceId": "..." } }

// Tool Management
{ "type": "get_tools", "payload": { "instanceId": "..." } }

// Settings Management
{ "type": "update_settings", "payload": { "instanceId": "...", "settings": {...} } }

// Auto-restart Controls
{ "type": "toggle_auto_restart", "payload": { "instanceId": "..." } }
{ "type": "set_global_auto_restart", "payload": { "enabled": true } }

// Command Approval
{ "type": "approve_command", "payload": { "instanceId": "..." } }
{ "type": "cancel_command", "payload": { "instanceId": "..." } }
```

#### Enhanced Status Response

```javascript
{
  "instanceCount": 3,
  "runningCount": 1,
  "authenticatingCount": 1,
  "waitingApprovalCount": 1,
  "instances": [
    {
      "id": "...",
      "name": "...",
      "status": "waiting_approval",
      "authStatus": "authenticated",
      "threadId": "thread-abc123...",
      "uptime": 12345,
      "promptsExecuted": 5,
      "restartCount": 0,
      "pendingCommand": {
        "command": "rm -rf /important/files",
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    }
  ]
}
```

## 🔍 Monitoring & Debugging

### Enhanced Log Monitoring

The system now monitors:
- **Authentication events**: Login failures, token expiry
- **Thread operations**: Creation, switches, forks
- **Tool usage**: Which tools are being used
- **Command approvals**: What needs manual approval
- **Error patterns**: Enhanced pattern matching

### Debug Mode

```bash
# Run with enhanced debugging
AMP_LOG_LEVEL=debug npm start

# Or with specific log file
AMP_LOG_FILE=./debug.log npm start
```

### Error Recovery

The system automatically handles:
- **Auth failures**: Prompts for re-authentication
- **Thread corruption**: Automatic thread recovery
- **Tool failures**: Graceful fallbacks
- **Credit exhaustion**: Clear user notifications


## 📁 File Structure

```
src/
├── components/
│   ├── AmpManager.tsx          # Main manager component
│   ├── FullScreenView.tsx      # Enhanced full-screen view
│   ├── CommandInput.tsx        # File mention support
│   └── ...
├── services/
│   ├── TmuxManager.ts          # Thread & auth management
│   ├── ControlSocket.ts        # Enhanced WebSocket API
│   ├── AmpLogMonitor.ts        # Advanced log monitoring
│   └── ...
├── utils/
│   └── AmpCliHelpers.ts        # Amp CLI utilities
├── types/
│   └── AmpInstance.ts          # Enhanced type definitions
└── ...
```

## 🛠️ Troubleshooting

### Authentication Issues

1. **"Authentication failed"**:
   ```bash
   # Re-authenticate manually
   amp logout
   amp login
   ```

2. **"Out of free credits"**:
   - Visit [ampcode.com/settings](https://ampcode.com/settings) to upgrade

### Thread Issues

1. **Thread not found**:
   ```bash
   # List available threads
   amp threads list
   ```

2. **Thread corruption**:
   - The manager will automatically create a new thread

### File Mention Issues

1. **Files not found**:
   - Check working directory setting
   - Ensure files exist and are readable

2. **Search too slow**:
   - Limit search depth in settings
   - Use more specific search terms

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure amp CLI compatibility
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**⚡ Powered by [Amp CLI](https://ampcode.com) - The AI coding agent from Sourcegraph** 
