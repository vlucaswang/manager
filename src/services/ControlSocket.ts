import { WebSocketServer, WebSocket } from 'ws';
import { ControlMessage, ControlResponse, AgentEvent } from '../types/AmpInstance.js';
import { TmuxManager } from './TmuxManager.js';

export class ControlSocket {
  private server: WebSocketServer | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private tmuxManager: TmuxManager | null = null;
  private eventStreams: Map<WebSocket, boolean> = new Map();

  constructor(port: number) {
    this.port = port;
  }

  setTmuxManager(tmuxManager: TmuxManager): void {
    this.tmuxManager = tmuxManager;
    
    // Set up event streaming
    tmuxManager.onAgentEvent((event: AgentEvent) => {
      this.broadcastEvent(event);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({ port: this.port });

        this.server.on('connection', (ws: WebSocket) => {
          this.clients.add(ws);
          
          ws.on('message', (data: Buffer) => {
            try {
              const message: ControlMessage = JSON.parse(data.toString());
              this.handleMessage(ws, message);
            } catch (error) {
              this.sendResponse(ws, {
                success: false,
                error: 'Invalid JSON message'
              });
            }
          });

          ws.on('close', () => {
            this.clients.delete(ws);
            this.eventStreams.delete(ws);
          });

          ws.on('error', (error: Error) => {
            console.warn('WebSocket error:', error);
            this.clients.delete(ws);
            this.eventStreams.delete(ws);
          });
        });

        this.server.on('listening', () => {
          resolve();
        });

        this.server.on('error', (error: Error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      this.clients.clear();
      this.eventStreams.clear();
      this.server.close();
      this.server = null;
    }
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private broadcastEvent(event: AgentEvent): void {
    const message = {
      type: 'agent_event',
      data: event,
      timestamp: new Date().toISOString()
    };

    this.eventStreams.forEach((enabled, client) => {
      if (enabled && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  private async handleMessage(ws: WebSocket, message: ControlMessage): Promise<void> {
    if (!this.tmuxManager) {
      this.sendResponse(ws, {
        success: false,
        error: 'TmuxManager not available',
        requestId: message.requestId
      });
      return;
    }

    try {
      let result;

      switch (message.type) {
        case 'list_instances':
          result = await this.tmuxManager.listInstances();
          break;

        case 'create_instance':
          result = await this.tmuxManager.createInstance(message.payload);
          break;

        case 'destroy_instance':
          await this.tmuxManager.removeInstance(message.payload.instanceId);
          result = { success: true };
          break;

        case 'send_prompt':
          await this.tmuxManager.sendPrompt(message.payload.instanceId, message.payload.prompt);
          result = { success: true };
          break;

        case 'approve_command':
          await this.tmuxManager.approveCommand(message.payload.instanceId);
          result = { success: true };
          break;

        case 'cancel_command':
          await this.tmuxManager.cancelCommand(message.payload.instanceId);
          result = { success: true };
          break;

        case 'restart_instance':
          await this.tmuxManager.restartInstance(message.payload.instanceId, message.payload.reason);
          result = { success: true };
          break;

        case 'create_thread':
          const threadId = await this.tmuxManager.createThread(message.payload.instanceId);
          result = { threadId, created: threadId !== null };
          break;

        case 'switch_thread':
          await this.tmuxManager.switchThread(message.payload.instanceId, message.payload.threadId);
          result = { success: true };
          break;

        case 'list_threads':
          result = await this.tmuxManager.listThreads(message.payload.instanceId);
          break;

        case 'fork_thread':
          // Fork thread - this would need to be implemented in TmuxManager
          result = { error: 'Fork thread not yet implemented' };
          break;

        case 'get_tools':
          result = await this.tmuxManager.getTools(message.payload.instanceId);
          break;

        case 'update_settings':
          // Update amp settings for an instance - this would need to be implemented in TmuxManager
          result = { error: 'Update settings not yet implemented' };
          break;

        case 'toggle_auto_restart':
          const instance = await this.tmuxManager.listInstances();
          const targetInstance = instance.find(i => i.id === message.payload.instanceId);
          if (targetInstance) {
            targetInstance.config.autoRestart = !targetInstance.config.autoRestart;
            result = { 
              instanceId: targetInstance.id,
              autoRestart: targetInstance.config.autoRestart,
              message: `Auto-restart ${targetInstance.config.autoRestart ? 'enabled' : 'disabled'} for ${targetInstance.name}`
            };
          } else {
            result = { error: 'Instance not found' };
          }
          break;

        case 'set_global_auto_restart':
          // This would need to be implemented to set global auto-restart setting
          result = { 
            globalAutoRestart: message.payload.enabled,
            message: `Global auto-restart ${message.payload.enabled ? 'enabled' : 'disabled'}`
          };
          break;

        case 'get_agent_stream':
          // Enable/disable event streaming for this client
          this.eventStreams.set(ws, message.payload.enabled !== false);
          result = { 
            streaming: this.eventStreams.get(ws),
            message: this.eventStreams.get(ws) ? 'Event streaming enabled' : 'Event streaming disabled'
          };
          break;

        case 'get_status':
          const instances = await this.tmuxManager.listInstances();
          result = {
            instanceCount: instances.length,
            runningCount: instances.filter(i => i.status === 'running').length,
            idleCount: instances.filter(i => i.status === 'idle').length,
            errorCount: instances.filter(i => i.status === 'error').length,
            waitingApprovalCount: instances.filter(i => i.status === 'waiting_approval').length,
            authenticatingCount: instances.filter(i => i.status === 'authenticating').length,
            instances: instances.map(i => ({
              id: i.id,
              name: i.name,
              status: i.status,
              authStatus: i.authStatus,
              threadId: i.threadId,
              uptime: Date.now() - i.createdAt.getTime(),
              promptsExecuted: i.stats.promptsExecuted,
              restartCount: i.stats.restartCount,
              pendingCommand: i.pendingCommand ? {
                command: i.pendingCommand.command.slice(0, 100),
                timestamp: i.pendingCommand.timestamp
              } : null
            }))
          };
          break;

        default:
          throw new Error(`Unknown command type: ${message.type}`);
      }

      this.sendResponse(ws, {
        success: true,
        data: result,
        requestId: message.requestId
      });

    } catch (error) {
      this.sendResponse(ws, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId
      });
    }
  }

  private sendResponse(ws: WebSocket, response: ControlResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }
} 