import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { AmpInstance } from '../types/AmpInstance.js';

// Store creation times globally to persist across re-renders
const instanceCreationTimes = new Map<string, number>();

interface FullScreenViewProps {
  instance: AmpInstance;
  onExit: () => void;
  onSendPrompt: (prompt: string) => void;
  onCreateThread?: () => void;
  onSwitchThread?: (threadId: string) => void;
  onToggleAutoRestart?: () => void;
  onApproveCommand?: () => void;
  onRejectCommand?: () => void;
}

export const FullScreenView: React.FC<FullScreenViewProps> = ({ 
  instance, 
  onExit, 
  onSendPrompt,
  onCreateThread,
  onSwitchThread,
  onToggleAutoRestart,
  onApproveCommand,
  onRejectCommand
}) => {
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);

  // Clear terminal when exiting to prevent UI artifacts
  const handleExit = () => {
    // Clear the terminal before exiting full screen
    process.stdout.write('\x1B[2J\x1B[0f');
    onExit();
  };

  const formatUptime = (instanceId: string, createdAt: Date): string => {
    // Get or set the creation time for this specific instance ID
    if (!instanceCreationTimes.has(instanceId)) {
      const creationTime = createdAt instanceof Date 
        ? createdAt.getTime() 
        : new Date(createdAt).getTime();
      instanceCreationTimes.set(instanceId, creationTime);
    }
    
    const creationTime = instanceCreationTimes.get(instanceId)!;
    const seconds = Math.floor((Date.now() - creationTime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'idle': return 'green';
      case 'running': return 'yellow';
      case 'error': return 'red';
      case 'stopped': return 'gray';
      case 'authenticating': return 'cyan';
      case 'waiting_approval': return 'magenta';
      default: return 'white';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'idle': return '💤';
      case 'running': return '⚡';
      case 'error': return '❌';
      case 'stopped': return '⏹️';
      case 'authenticating': return '🔐';
      case 'waiting_approval': return '⏳';
      default: return '❓';
    }
  };

  const getAuthStatusIcon = (authStatus: string): string => {
    switch (authStatus) {
      case 'authenticated': return '✅';
      case 'failed': return '❌';
      case 'pending': return '⏳';
      case 'unknown': return '❓';
      default: return '❓';
    }
  };

  const getAuthStatusColor = (authStatus: string): string => {
    switch (authStatus) {
      case 'authenticated': return 'green';
      case 'failed': return 'red';
      case 'pending': return 'yellow';
      case 'unknown': return 'gray';
      default: return 'gray';
    }
  };

  // Format and filter output for better display
  const formatOutput = (outputLines: string[]): string[] => {
    return outputLines
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0;
      })
      .map(line => {
        // Clean up the line but preserve more context than the panel view
        return line.replace(/^[\>\$]\s*/, '');
      });
  };

  const displayOutput = formatOutput(instance.output);
  const maxDisplayLines = 20; // Show more lines in full screen
  const startIndex = Math.max(0, displayOutput.length - maxDisplayLines + scrollOffset);
  const endIndex = Math.min(displayOutput.length, startIndex + maxDisplayLines);
  const visibleOutput = displayOutput.slice(startIndex, endIndex);

  useInput((input, key) => {
    if (showPromptInput) {
      if (key.escape) {
        setShowPromptInput(false);
        setPromptInput('');
      } else if (key.return) {
        if (promptInput.trim()) {
          onSendPrompt(promptInput.trim());
          setPromptInput('');
          setShowPromptInput(false);
        }
      } else if (key.backspace || key.delete) {
        setPromptInput(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setPromptInput(prev => prev + input);
      }
    } else {
      if (key.escape || input === 'q') {
        handleExit();
      } else if (input === 'p') {
        setShowPromptInput(true);
      } else if (input === 't' && onCreateThread) {
        onCreateThread();
      } else if (key.upArrow) {
        setScrollOffset(prev => Math.min(prev + 1, displayOutput.length - maxDisplayLines));
      } else if (key.downArrow) {
        setScrollOffset(prev => Math.max(prev - 1, -(displayOutput.length - maxDisplayLines)));
      } else if (input === 'r' && onToggleAutoRestart) {
        onToggleAutoRestart();
      } else if (input === 'a' && onApproveCommand) {
        onApproveCommand();
      } else if (input === 'x' && onRejectCommand) {
        onRejectCommand();
      }
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box 
        paddingX={2} 
        paddingY={1} 
        borderStyle="double" 
        borderColor="cyan"
        justifyContent="space-between"
      >
        <Box>
          <Text color="cyan" bold>
            📺 Full Screen View - {instance.name}
          </Text>
        </Box>
        <Box gap={2}>
          <Text color={getAuthStatusColor(instance.authStatus)}>
            {getAuthStatusIcon(instance.authStatus)} Auth: {instance.authStatus}
          </Text>
          <Text color={getStatusColor(instance.status)}>
            {getStatusIcon(instance.status)} {instance.status.toUpperCase()}
          </Text>
        </Box>
      </Box>

      {/* Instance info */}
      <Box paddingX={2} paddingY={1} borderStyle="single" borderColor="gray">
        <Box flexDirection="column" flexGrow={1}>
          <Text color="gray">
            ID: {instance.id} | Uptime: {formatUptime(instance.id, instance.createdAt)} | 
            Prompts: {instance.stats.promptsExecuted} | 
            Restarts: {instance.stats.restartCount} |
            Last Activity: {instance.lastActivity.toLocaleTimeString()}
          </Text>
          <Box>
            <Text color="gray">Auto-restart: </Text>
            <Text color={instance.config.autoRestart ? "green" : "red"} bold>
              {instance.config.autoRestart ? "ENABLED" : "DISABLED"}
            </Text>
            <Text color="gray"> | </Text>
            {instance.threadId && (
              <>
                <Text color="blue">📧 Thread: {instance.threadId.slice(0, 16)}...</Text>
                <Text color="gray"> | </Text>
              </>
            )}
            {instance.ampSettings?.['amp.commands.allowlist'] && (
              <Text color="green">
                🛡️  Commands allowlisted: {instance.ampSettings['amp.commands.allowlist'].length}
              </Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Current prompt */}
      {instance.currentPrompt && (
        <Box paddingX={2} paddingY={1} borderStyle="single" borderColor="yellow">
          <Box flexDirection="column">
            <Text color="yellow" bold>Current Prompt:</Text>
            <Text color="white">{instance.currentPrompt}</Text>
          </Box>
        </Box>
      )}

      {/* Pending command approval */}
      {instance.pendingCommand && (
        <Box paddingX={2} paddingY={1} borderStyle="double" borderColor="magenta">
          <Box flexDirection="column">
            <Text color="magenta" bold>⚠️  COMMAND APPROVAL REQUIRED ⚠️</Text>
            <Box marginTop={1}>
              <Text color="yellow">Command: </Text>
              <Text color="white" bold>{instance.pendingCommand.command}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color="gray">Submitted: {instance.pendingCommand.timestamp.toLocaleTimeString()}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color="green" bold>[a] APPROVE</Text>
              <Text color="gray"> | </Text>
              <Text color="red" bold>[x] REJECT</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Output area */}
      <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="cyan" bold>Amp Output ({displayOutput.length} lines):</Text>
          {displayOutput.length > maxDisplayLines && (
            <Text color="gray">
              Showing {startIndex + 1}-{endIndex} | ↑↓ to scroll
            </Text>
          )}
        </Box>
        
        <Box 
          flexDirection="column" 
          flexGrow={1}
          borderStyle="single" 
          borderColor="gray"
          paddingX={1}
          paddingY={1}
        >
          {instance.status === 'running' && (
            <Box marginBottom={1}>
              <Spinner type="dots" />
              <Text color="yellow"> Processing prompt...</Text>
            </Box>
          )}

          {instance.status === 'authenticating' && (
            <Box marginBottom={1}>
              <Spinner type="dots" />
              <Text color="cyan"> Authenticating with amp...</Text>
            </Box>
          )}
          
          {visibleOutput.length > 0 ? (
            visibleOutput.map((line, index) => {
              // Enhanced color coding
              let color = 'white';
              let bold = false;
              
              if (line.includes('Error') || line.includes('error') || line.includes('ERROR')) {
                color = 'red';
                bold = true;
              } else if (line.includes('authentication failed') || line.includes('Out of free credits')) {
                color = 'red';
                bold = true;
              } else if (line.includes('Warning') || line.includes('warning') || line.includes('WARN')) {
                color = 'yellow';
              } else if (line.includes('✓') || line.includes('Success') || line.includes('success')) {
                color = 'green';
                bold = true;
              } else if (line.startsWith('> ') || line.startsWith('$ ') || line.includes('amp>')) {
                color = 'cyan';
              } else if (line.includes('INFO') || line.includes('info')) {
                color = 'blue';
              } else if (line.includes('thread') && line.includes('created')) {
                color = 'magenta';
                bold = true;
              }

              return (
                <Text key={startIndex + index} color={color} bold={bold}>
                  {line}
                </Text>
              );
            })
          ) : (
            <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
              <Text color="gray" italic>
                {instance.status === 'running' 
                  ? 'Waiting for amp response...' 
                  : instance.status === 'authenticating'
                  ? 'Authenticating with amp...'
                  : instance.authStatus === 'failed'
                  ? 'Authentication failed. Check credentials.'
                  : 'No output yet. Press "p" to send a prompt!'
                }
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Prompt input overlay */}
      {showPromptInput && (
        <Box
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          height={10}
        >
          <Box
            borderStyle="double"
            borderColor="cyan"
            paddingX={3}
            paddingY={2}
            width={80}
            flexDirection="column"
          >
            <Box marginBottom={1}>
              <Text color="cyan" bold>
                Send Prompt to {instance.name}
              </Text>
            </Box>
            
            <Box marginBottom={1}>
              <Text color="yellow">Prompt: </Text>
              <Text color="white">{promptInput}</Text>
              <Text color="cyan">█</Text>
            </Box>

            <Box flexDirection="column">
              <Text color="gray" dimColor>
                • Type your prompt and press Enter to send
              </Text>
              <Text color="gray" dimColor>
                • Use @ to mention files (e.g., @filename.txt)
              </Text>
              <Text color="gray" dimColor>
                • Press Escape to cancel
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Controls */}
      <Box paddingX={2} paddingY={1} borderStyle="single" borderColor="gray">
        <Text color="gray" dimColor>
          Controls: p Send Prompt | t New Thread | r Toggle Auto-restart | ↑↓ Scroll | ESC/q Exit Full Screen | a Approve | x Reject
        </Text>
      </Box>
    </Box>
  );
}; 