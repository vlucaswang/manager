import { promises as fs } from 'fs';
import { join } from 'path';
import { AmpSettings } from '../types/AmpInstance.js';

export class AmpCliHelpers {
  
  /**
   * Format a prompt for amp CLI non-interactive mode
   */
  static formatPromptForNonInteractive(prompt: string): string {
    // Escape quotes and special characters
    return prompt
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  }

  /**
   * Check if a command should be auto-approved based on allowlist
   */
  static isCommandAllowed(prompt: string, allowlist: string[]): boolean {
    const normalizedPrompt = prompt.toLowerCase().trim();
    
    return allowlist.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase();
      return normalizedPrompt.includes(normalizedAllowed) || 
             normalizedPrompt.startsWith(normalizedAllowed);
    });
  }

  /**
   * Build amp CLI command with all options
   */
  static buildAmpCommand(options: {
    threadId?: string;
    logLevel?: string;
    logFile?: string;
    settingsFile?: string;
    notifications?: boolean;
    nonInteractive?: boolean;
  }): string {
    let command = 'amp';
    
    if (options.threadId) {
      command += ` --thread-id ${options.threadId}`;
    }
    
    if (options.logLevel) {
      command += ` --log-level ${options.logLevel}`;
    }
    
    if (options.logFile) {
      command += ` --log-file "${options.logFile}"`;
    }
    
    if (options.settingsFile) {
      command += ` --settings-file "${options.settingsFile}"`;
    }
    
    if (options.notifications === false) {
      command += ' --no-notifications';
    }
    
    return command;
  }

  /**
   * Create amp settings file
   */
  static async createSettingsFile(settingsPath: string, settings: AmpSettings): Promise<void> {
    const settingsContent = {
      ...settings,
      // Ensure required settings are present
      'amp.notifications.enabled': settings['amp.notifications.enabled'] ?? true,
      'amp.commands.allowlist': settings['amp.commands.allowlist'] ?? [
        'git status',
        'ls -la',
        'pwd',
        'cat',
        'grep',
        'find',
        'tree'
      ]
    };

    await fs.writeFile(settingsPath, JSON.stringify(settingsContent, null, 2));
  }

  /**
   * Parse amp CLI version and capabilities
   */
  static parseAmpVersion(output: string): { version?: string; authenticated: boolean } {
    const versionMatch = output.match(/amp\s+v?([\d.]+)/i);
    const authenticated = !output.toLowerCase().includes('not authenticated') &&
                         !output.toLowerCase().includes('authentication failed');
    
    return {
      version: versionMatch ? versionMatch[1] : undefined,
      authenticated
    };
  }

  /**
   * Parse thread ID from amp CLI output
   */
  static parseThreadId(output: string): string | null {
    // Look for thread ID patterns in output
    const patterns = [
      /thread[:\s]+([a-f0-9-]{8,})/i,
      /created thread[:\s]+([a-f0-9-]{8,})/i,
      /thread id[:\s]+([a-f0-9-]{8,})/i
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Parse available tools from amp CLI output
   */
  static parseAvailableTools(output: string): string[] {
    const tools: string[] = [];
    const lines = output.split('\n');
    
    let inToolsSection = false;
    
    for (const line of lines) {
      if (line.toLowerCase().includes('available tools') || 
          line.toLowerCase().includes('tools:')) {
        inToolsSection = true;
        continue;
      }
      
      if (inToolsSection) {
        // Stop if we hit an empty line or new section
        if (line.trim() === '' || line.match(/^[A-Z]/)) {
          break;
        }
        
        // Extract tool names
        const toolMatch = line.match(/^\s*[-*]\s*(\w+)/);
        if (toolMatch) {
          tools.push(toolMatch[1]);
        }
      }
    }
    
    return tools;
  }

  /**
   * Detect if amp is requesting approval for a command
   */
  static isApprovalRequest(output: string): { isRequest: boolean; command?: string } {
    const approvalPatterns = [
      /Allow this command\?\s*\[y\/n\/!\]/i,
      /Run this command\?\s*\[y\/n\/!\]/i,
      /Execute:\s*(.+?)\s*\[y\/n\/!\]/i
    ];

    for (const pattern of approvalPatterns) {
      const match = output.match(pattern);
      if (match) {
        return {
          isRequest: true,
          command: match[1] || 'Unknown command'
        };
      }
    }

    return { isRequest: false };
  }

  /**
   * Extract error messages from amp CLI output
   */
  static extractErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.match(/^error:/i) ||
          trimmed.match(/^fatal:/i) ||
          trimmed.includes('authentication failed') ||
          trimmed.includes('out of free credits') ||
          trimmed.includes('exceed context limit')) {
        errors.push(trimmed);
      }
    }
    
    return errors;
  }

  /**
   * Format file mentions for amp CLI
   */
  static formatFileMentions(prompt: string, workingDir: string): string {
    // Replace @filename patterns with proper file references
    return prompt.replace(/@([^\s]+)/g, (match, filename) => {
      // If it's already a relative path, keep it
      if (filename.includes('/')) {
        return `@${filename}`;
      }
      
      // Otherwise, make it relative to working directory
      return `@${filename}`;
    });
  }

  /**
   * Get recommended amp settings for supervised instances
   */
  static getRecommendedSettings(): AmpSettings {
    return {
      'amp.notifications.enabled': true,
      'amp.commands.allowlist': [
        'git status',
        'git diff',
        'git log',
        'ls -la',
        'ls -l',
        'pwd',
        'cat',
        'head',
        'tail',
        'grep',
        'find',
        'tree',
        'npm list',
        'npm run',
        'yarn list',
        'node --version',
        'npm --version'
      ],
      'amp.tools.disable': [
        // Disable potentially destructive tools
        'browser_navigate' // if you don't want web browsing
      ],
      'amp.mcp.disable': []
    };
  }
} 