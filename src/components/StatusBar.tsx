import React from 'react';
import { Box, Text } from 'ink';
import { AmpInstance } from '../types/AmpInstance.js';

interface StatusBarProps {
  instances: AmpInstance[];
  selectedInstance: number;
  logs: string[];
}

export const StatusBar: React.FC<StatusBarProps> = ({ 
  instances, 
  selectedInstance, 
  logs 
}) => {
  const runningCount = instances.filter(i => i.status === 'running').length;
  const idleCount = instances.filter(i => i.status === 'idle').length;
  const errorCount = instances.filter(i => i.status === 'error').length;

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="yellow">
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color="green">Idle: {idleCount}</Text>
          <Text color="yellow"> Running: {runningCount}</Text>
          <Text color="red"> Errors: {errorCount}</Text>
        </Box>
        <Text color="cyan">
          Selected: {instances[selectedInstance]?.name || 'None'} ({selectedInstance + 1}/{instances.length})
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray" bold>Recent Activity:</Text>
        {logs.map((log, index) => (
          <Text key={index} color="white" dimColor>
            {log}
          </Text>
        ))}
        {logs.length === 0 && (
          <Text color="gray" italic>No recent activity</Text>
        )}
      </Box>
    </Box>
  );
}; 