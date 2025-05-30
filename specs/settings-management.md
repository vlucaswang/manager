# Settings Management Specification

## Overview
Hierarchical settings system with global defaults and per-instance overrides for comprehensive configuration management.

## Settings Hierarchy

### Global Settings
- Default auto-restart behavior
- Default inactivity thresholds
- System-wide preferences
- Stored in `~/.config/amp-manager/`

### Per-Instance Settings
- Override global defaults
- Instance-specific configuration
- Runtime editable values
- Persistent across restarts

## Configuration Schema

### Instance Configuration
```typescript
interface InstanceConfig {
  name?: string;
  workingDirectory?: string;
  initialPrompt?: string;
  environment?: Record<string, string>;
  autoRestart?: boolean;
  inactivityThreshold?: number;
  requireApproval?: boolean;
  errorPatterns?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  threadId?: string;
  ampSettings?: AmpSettings;
  commandAllowlist?: string[];
}
```

### Amp CLI Integration
```typescript
interface AmpSettings {
  'amp.notifications.enabled'?: boolean;
  'amp.mcpServers'?: Record<string, { command: string; args: string[] }>;
  'amp.mcp.disable'?: string[];
  'amp.tools.disable'?: string[];
  'amp.commands.allowlist'?: string[];
}
```

## User Interface

### Settings Panel
- Tab navigation: General/Instance
- Toggle switches for boolean values
- Editable fields for thresholds
- Visual indicators for current values

### Runtime Modification
- Immediate effect on changes
- No restart required
- Validation of input values
- Persistence to disk

## Implementation

### Storage
- JSON configuration files
- Per-user configuration directory
- Backup and restoration support
- Migration support for schema changes

### API Integration
- WebSocket commands for remote settings
- Bulk configuration updates
- Settings validation and sanitization
