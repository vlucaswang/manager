export interface AmpInstance {
  id: string;
  name: string;
  tmuxPane: string;
  status: 'idle' | 'running' | 'error' | 'stopped' | 'waiting_approval' | 'authenticating';
  createdAt: Date;
  lastActivity: Date;
  lastInactivityCheck: Date;
  workingDirectory?: string;
  logFile?: string;
  output: string[];
  currentPrompt?: string;
  threadId?: string; // amp CLI thread ID
  authStatus: 'authenticated' | 'pending' | 'failed' | 'unknown';
  pendingCommand?: {
    command: string;
    requiresApproval: boolean;
    timestamp: Date;
  };
  stats: {
    promptsExecuted: number;
    tokensUsed: number;
    uptime: number;
    restartCount: number;
    lastRestart?: Date;
  };
  config: InstanceConfig;
  errorPatterns: string[];
  inactivityThreshold: number; // seconds
  ampSettings?: AmpSettings; // amp CLI settings
}

export interface InstanceConfig {
  name?: string;
  workingDirectory?: string;
  initialPrompt?: string;
  environment?: Record<string, string>;
  autoRestart?: boolean;
  inactivityThreshold?: number;
  requireApproval?: boolean;
  errorPatterns?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  threadId?: string; // Continue existing thread
  ampSettings?: AmpSettings;
  commandAllowlist?: string[]; // Commands that don't require approval
}

export interface AmpSettings {
  'amp.notifications.enabled'?: boolean;
  'amp.mcpServers'?: Record<string, { command: string; args: string[] }>;
  'amp.mcp.disable'?: string[];
  'amp.tools.disable'?: string[];
  'amp.commands.allowlist'?: string[];
}

export interface InstanceEvent {
  type: 'created' | 'destroyed' | 'output' | 'error' | 'prompt_sent' | 'prompt_completed' | 
        'thread_created' | 'thread_switched' | 'auth_changed';
  instanceId: string;
  timestamp: Date;
  data?: any;
}

export interface ControlMessage {
  type: 'create_instance' | 'destroy_instance' | 'send_prompt' | 'get_status' | 'list_instances' | 
        'approve_command' | 'cancel_command' | 'restart_instance' | 'get_agent_stream' | 
        'set_error_patterns' | 'configure_watchdog' | 'create_thread' | 'switch_thread' |
        'list_threads' | 'fork_thread' | 'get_tools' | 'update_settings' | 'toggle_auto_restart' |
        'set_global_auto_restart';
  payload: any;
  requestId?: string;
}

export interface ControlResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
}

export interface AgentEvent {
  instanceId: string;
  timestamp: Date;
  type: 'prompt_sent' | 'command_executed' | 'error_detected' | 'restart_triggered' | 
        'inactivity_detected' | 'approval_required' | 'status_changed' | 'thread_created' |
        'auth_status_changed' | 'tool_used' | 'thread_switched';
  data: any;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

export interface WatchdogConfig {
  inactivityThreshold: number;
  errorPatterns: string[];
  autoRestart: boolean;
  requireApproval: boolean;
}

export interface ThreadInfo {
  id: string;
  title?: string;
  shared: boolean;
  createdAt: Date;
  lastActivity: Date;
} 