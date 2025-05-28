import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { AmpInstance } from '../types/AmpInstance.js';

interface InstancePanelProps {
  instance: AmpInstance;
  isSelected: boolean;
  onSendPrompt: (prompt: string) => void;
}

// Store creation times globally to persist across re-renders
const instanceCreationTimes = new Map<string, number>();

// Export cleanup function for external use
export const cleanupInstanceTime = (instanceId: string) => {
  instanceCreationTimes.delete(instanceId);
};

export const InstancePanel: React.FC<InstancePanelProps> = ({ 
  instance, 
  isSelected,
  onSendPrompt 
}) => {
  const [uptime, setUptime] = useState(0);
  
  // Get or set the creation time for this specific instance ID
  const getCreationTime = () => {
    if (!instanceCreationTimes.has(instance.id)) {
      const creationTime = instance.createdAt instanceof Date 
        ? instance.createdAt.getTime() 
        : new Date(instance.createdAt).getTime();
      instanceCreationTimes.set(instance.id, creationTime);
    }
    return instanceCreationTimes.get(instance.id)!;
  };

  useEffect(() => {
    const creationTime = getCreationTime();
    
    const updateUptime = () => {
      const now = Date.now();
      const uptimeSeconds = Math.floor((now - creationTime) / 1000);
      setUptime(Math.max(0, uptimeSeconds));
    };
    
    // Update immediately
    updateUptime();
    
    // Then update every second
    const interval = setInterval(updateUptime, 1000);

    return () => clearInterval(interval);
  }, [instance.id]); // Only depend on the instance ID

  const formatUptime = (seconds: number): string => {
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
      case 'waiting_approval': return 'cyan';
      default: return 'white';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'idle': return '💤';
      case 'running': return '⚡';
      case 'error': return '❌';
      case 'stopped': return '⏹️';
      case 'waiting_approval': return '⏳';
      default: return '❓';
    }
  };

  // Filter and format output to show meaningful content
  const formatOutput = (outputLines: string[]): string[] => {
    return outputLines
      .filter(line => {
        const trimmed = line.trim();
        // Filter out empty lines and tmux status lines
        return trimmed.length > 0 && 
               !trimmed.startsWith('[') && 
               !trimmed.includes('tmux') &&
               trimmed !== '>' &&
               trimmed !== '$';
      })
      .map(line => {
        // Clean up the line - remove leading prompt characters
        return line.replace(/^[\>\$]\s*/, '').trim();
      })
      .slice(-10); // Show last 10 meaningful lines
  };

  const displayOutput = formatOutput(instance.output);

  return (
    <Box 
      flexDirection="column" 
      width={50}
      margin={1}
      paddingX={1}
      paddingY={1}
      borderStyle={isSelected ? 'double' : 'single'}
      borderColor={isSelected ? 'cyan' : 'gray'}
      minHeight={20}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>{instance.name}</Text>
        <Text color={getStatusColor(instance.status)}>
          {getStatusIcon(instance.status)} {instance.status.toUpperCase()}
        </Text>
      </Box>

      {/* Stats */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">ID: {instance.id.slice(0, 8)}</Text>
        <Text color="gray">Uptime: {formatUptime(uptime)}</Text>
        <Text color="gray">Prompts: {instance.stats.promptsExecuted}</Text>
        {instance.stats.restartCount > 0 && (
          <Text color="orange">Restarts: {instance.stats.restartCount}</Text>
        )}
        {instance.stats.tokensUsed > 0 && (
          <Text color="gray">Tokens: {instance.stats.tokensUsed.toLocaleString()}</Text>
        )}
        <Box>
          <Text color="gray">Auto-restart: </Text>
          <Text color={instance.config.autoRestart ? "green" : "red"} bold>
            {instance.config.autoRestart ? "ON" : "OFF"}
          </Text>
        </Box>
        {instance.threadId && (
          <Text color="blue">Thread: {instance.threadId.slice(0, 8)}...</Text>
        )}
        {instance.authStatus && (
          <Box>
            <Text color="gray">Auth: </Text>
            <Text color={instance.authStatus === 'authenticated' ? "green" : "red"}>
              {instance.authStatus}
            </Text>
          </Box>
        )}
      </Box>

      {/* Pending approval */}
      {instance.status === 'waiting_approval' && instance.pendingCommand && (
        <Box 
          flexDirection="column" 
          marginBottom={1} 
          paddingX={1} 
          borderStyle={isSelected ? "double" : "single"} 
          borderColor={isSelected ? "magenta" : "cyan"}
        >
          <Text color="magenta" bold>
            {isSelected ? "⚠️  APPROVAL REQUIRED ⚠️" : "⏳ Awaiting Approval:"}
          </Text>
          <Text color="white">
            {instance.pendingCommand.command.length > 60 
              ? `${instance.pendingCommand.command.slice(0, 60)}...` 
              : instance.pendingCommand.command
            }
          </Text>
          <Text color="gray" dimColor>
            Requested: {instance.pendingCommand.timestamp.toLocaleTimeString()}
          </Text>
          {isSelected && (
            <Box marginTop={1}>
              <Text color="green" bold>[a]</Text>
              <Text color="gray"> Approve | </Text>
              <Text color="red" bold>[x]</Text>
              <Text color="gray"> Reject</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Current activity */}
      {instance.status === 'running' && (
        <Box marginBottom={1}>
          <Spinner type="dots" />
          <Text color="yellow"> Processing...</Text>
        </Box>
      )}

      {instance.currentPrompt && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow" bold>Current Prompt:</Text>
          <Text color="white">
            {instance.currentPrompt.length > 80 
              ? `${instance.currentPrompt.slice(0, 80)}...` 
              : instance.currentPrompt
            }
          </Text>
        </Box>
      )}

      {/* Output display */}
      <Box flexDirection="column" flexGrow={1}>
        <Text color="gray" bold>Amp Output:</Text>
        <Box 
          flexDirection="column" 
          height={8}
          paddingX={1}
          borderStyle="single"
          borderColor="gray"
        >
          {displayOutput.length > 0 ? (
            displayOutput.map((line, index) => {
              // Color code different types of output
              let color = 'white';
              if (line.includes('Error') || line.includes('error')) {
                color = 'red';
              } else if (line.includes('Warning') || line.includes('warning')) {
                color = 'yellow';
              } else if (line.includes('✓') || line.includes('Success')) {
                color = 'green';
              } else if (line.startsWith('> ') || line.startsWith('$ ')) {
                color = 'cyan';
              }

              return (
                <Text key={index} color={color} dimColor={color === 'white'}>
                  {line.length > 45 ? `${line.slice(0, 45)}...` : line}
                </Text>
              );
            })
          ) : (
            <Text color="gray" italic>
              {instance.status === 'running' ? 'Waiting for amp response...' : 'No output yet - try sending a prompt!'}
            </Text>
          )}
        </Box>
      </Box>

      {/* Last activity */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          Last: {instance.lastActivity.toLocaleTimeString()}
        </Text>
        {isSelected && (
          <Text color="cyan" bold>SELECTED</Text>
        )}
      </Box>
    </Box>
  );
}; 