import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import { TmuxManager } from '../services/TmuxManager.js';
import { AmpInstance, InstanceConfig } from '../types/AmpInstance.js';
import { InstancePanel, cleanupInstanceTime } from './InstancePanel.js';
import { StatusBar } from './StatusBar.js';
import { CommandInput } from './CommandInput.js';
import { FullScreenView } from './FullScreenView.js';
import { ControlSocket } from '../services/ControlSocket.js';

interface AmpManagerProps {
  sessionName: string;
  port: number;
}

export const AmpManager: React.FC<AmpManagerProps> = ({ sessionName, port }) => {
  const { exit } = useApp();
  const [instances, setInstances] = useState<AmpInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number>(0);
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [tmuxManager] = useState(() => new TmuxManager(sessionName));
  const [controlSocket] = useState(() => new ControlSocket(port));
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [globalAutoRestart, setGlobalAutoRestart] = useState(true);
  const [defaultInactivityThreshold, setDefaultInactivityThreshold] = useState(120);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'instance'>('general');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  
  // Use refs to track cleanup and prevent duplicate operations
  const isCleaningUp = useRef(false);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize tmux and control socket
  useEffect(() => {
    const init = async () => {
      try {
        await tmuxManager.initialize();
        
        // Connect control socket to tmux manager
        controlSocket.setTmuxManager(tmuxManager);
        
        // Set up agent event handling
        tmuxManager.onAgentEvent((event) => {
          const severity = event.severity === 'error' || event.severity === 'critical' ? '❌' : 
                          event.severity === 'warn' ? '⚠️' : '✅';
          addLog(`${severity} ${event.instanceId.slice(0, 8)}: ${event.type} - ${JSON.stringify(event.data).slice(0, 50)}`);
        });
        
        await controlSocket.start();
        setIsLoading(false);
        
        addLog(`🚀 Amp Manager started on port ${port}`);
        addLog(`📺 Tmux session: ${sessionName}`);
        addLog(`🔍 Watchdog monitoring enabled`);
      } catch (error) {
        addLog(`❌ Failed to initialize: ${error}`);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cleanup();
    };
  }, [tmuxManager, controlSocket, port, sessionName]);

  // Cleanup function
  const cleanup = useCallback(async () => {
    if (isCleaningUp.current) return;
    isCleaningUp.current = true;
    
    // Clear refresh interval
    if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }
    
    // Stop services
    try {
      await controlSocket.stop();
      await tmuxManager.cleanup();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
    
    // Clear terminal
    process.stdout.write('\x1B[2J\x1B[0f');
  }, [controlSocket, tmuxManager]);

  // Periodic refresh to update instances with latest data
  useEffect(() => {
    if (isLoading || isCleaningUp.current) return;
    
    const startRefresh = () => {
      // Clear any existing interval
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      
      refreshInterval.current = setInterval(async () => {
        if (isCleaningUp.current) return;
        
        try {
          const currentInstances = await tmuxManager.listInstances();
          setInstances(currentInstances);
          setRefreshTrigger(prev => prev + 1);
        } catch (error) {
          // Silently handle errors to avoid spam
        }
      }, 1000); // Refresh every second
    };

    startRefresh();

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    };
  }, [tmuxManager, isLoading]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), `${timestamp} ${message}`]);
  }, []);

  const toggleGlobalAutoRestart = useCallback(() => {
    const newValue = !globalAutoRestart;
    setGlobalAutoRestart(newValue);
    
    // Update all existing instances
    instances.forEach(instance => {
      instance.config.autoRestart = newValue;
    });
    
    addLog(`🔄 Global auto-restart ${newValue ? 'enabled' : 'disabled'}`);
  }, [globalAutoRestart, instances, addLog]);

  const updateDefaultInactivityThreshold = useCallback((newValue: number) => {
    setDefaultInactivityThreshold(newValue);
    addLog(`⏱️  Default inactivity threshold set to ${newValue} seconds`);
  }, [addLog]);

  const updateInstanceInactivityThreshold = useCallback((instanceId: string, newValue: number) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;
    
    instance.inactivityThreshold = newValue;
    
    // Update the instances array to trigger re-render
    setInstances(prev => prev.map(i => 
      i.id === instanceId 
        ? { ...i, inactivityThreshold: newValue }
        : i
    ));
    
    addLog(`⏱️  Inactivity threshold for ${instance.name} set to ${newValue} seconds`);
  }, [instances, addLog]);

  const startEditing = useCallback((fieldName: string, currentValue: string) => {
    setEditingField(fieldName);
    setEditingValue(currentValue);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingField) return;
    
    const numValue = parseInt(editingValue);
    if (isNaN(numValue) || numValue < 10 || numValue > 3600) {
      addLog(`❌ Invalid value: must be between 10 and 3600 seconds`);
      setEditingField(null);
      setEditingValue('');
      return;
    }
    
    if (editingField === 'defaultThreshold') {
      updateDefaultInactivityThreshold(numValue);
    } else if (editingField.startsWith('instanceThreshold:')) {
      const instanceId = editingField.split(':')[1];
      updateInstanceInactivityThreshold(instanceId, numValue);
    }
    
    setEditingField(null);
    setEditingValue('');
  }, [editingField, editingValue, updateDefaultInactivityThreshold, updateInstanceInactivityThreshold, addLog]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setEditingValue('');
  }, []);

  const toggleInstanceAutoRestart = useCallback(async (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;
    
    const newValue = !instance.config.autoRestart;
    instance.config.autoRestart = newValue;
    
    // Update the instances array to trigger re-render
    setInstances(prev => prev.map(i => 
      i.id === instanceId 
        ? { ...i, config: { ...i.config, autoRestart: newValue } }
        : i
    ));
    
    addLog(`🔄 Auto-restart for ${instance.name}: ${newValue ? 'enabled' : 'disabled'}`);
  }, [instances, addLog]);

  const createInstance = useCallback(async (name?: string) => {
    if (isCleaningUp.current) return null;
    
    try {
      const config: InstanceConfig = { 
        name,
        autoRestart: globalAutoRestart, // Use global setting for new instances
        inactivityThreshold: defaultInactivityThreshold // Use global default
      };
      const instance = await tmuxManager.createInstance(config);
      setInstances(prev => [...prev, instance]);
      addLog(`✅ Created instance: ${instance.name} (Auth: ${instance.authStatus}, Auto-restart: ${instance.config.autoRestart ? 'ON' : 'OFF'})`);
      return instance;
    } catch (error) {
      addLog(`❌ Failed to create instance: ${error}`);
      return null;
    }
  }, [tmuxManager, addLog, globalAutoRestart, defaultInactivityThreshold]);

  const createThread = useCallback(async (instanceId: string) => {
    if (isCleaningUp.current) return;
    
    try {
      const threadId = await tmuxManager.createThread(instanceId);
      if (threadId) {
        addLog(`🧵 Created thread: ${threadId.slice(0, 16)}...`);
      } else {
        addLog(`❌ Failed to create thread for instance`);
      }
    } catch (error) {
      addLog(`❌ Thread creation error: ${error}`);
    }
  }, [tmuxManager, addLog]);

  const removeInstance = useCallback(async (id: string) => {
    if (isCleaningUp.current) return;
    
    try {
      const instance = instances.find(i => i.id === id);
      if (instance) {
        // Clear terminal before removing instance to prevent UI artifacts
        process.stdout.write('\x1B[2J\x1B[0f');
        
        await tmuxManager.removeInstance(id);
        setInstances(prev => prev.filter(i => i.id !== id));
        
        // Clean up the creation time tracking
        cleanupInstanceTime(id);
        
        addLog(`🗑️  Removed instance: ${instance.name}`);
        
        // Adjust selection if needed
        if (selectedInstance >= instances.length - 1) {
          setSelectedInstance(Math.max(0, instances.length - 2));
        }
        
        // Small delay to allow Ink to redraw the UI properly
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 100);
      }
    } catch (error) {
      addLog(`❌ Failed to remove instance: ${error}`);
    }
  }, [tmuxManager, instances, selectedInstance, addLog, setRefreshTrigger]);

  const sendPrompt = useCallback(async (instanceId: string, prompt: string) => {
    if (isCleaningUp.current) return;
    
    try {
      await tmuxManager.sendPrompt(instanceId, prompt);
      const instance = instances.find(i => i.id === instanceId);
      addLog(`📝 Sent prompt to ${instance?.name}: ${prompt.slice(0, 50)}...`);
    } catch (error) {
      addLog(`❌ Failed to send prompt: ${error}`);
    }
  }, [tmuxManager, instances, addLog]);

  const approveCommand = useCallback(async (instanceId: string) => {
    if (isCleaningUp.current) return;
    
    try {
      await tmuxManager.approveCommand(instanceId);
      const instance = instances.find(i => i.id === instanceId);
      addLog(`✅ Approved command for ${instance?.name}`);
    } catch (error) {
      addLog(`❌ Failed to approve command: ${error}`);
    }
  }, [tmuxManager, instances, addLog]);

  const rejectCommand = useCallback(async (instanceId: string) => {
    if (isCleaningUp.current) return;
    
    try {
      await tmuxManager.cancelCommand(instanceId);
      const instance = instances.find(i => i.id === instanceId);
      addLog(`❌ Rejected command for ${instance?.name}`);
    } catch (error) {
      addLog(`❌ Failed to reject command: ${error}`);
    }
  }, [tmuxManager, instances, addLog]);

  // Handle app exit
  const handleExit = useCallback(async () => {
    await cleanup();
    exit();
  }, [cleanup, exit]);

  // Keyboard navigation
  useInput((input: string, key: any) => {
    if (showCommandInput || showFullScreen) {
      return;
    }

    if (showSettings) {
      if (editingField) {
        // In editing mode
        if (key.escape) {
          cancelEdit();
        } else if (key.return) {
          saveEdit();
        } else if (key.backspace || key.delete) {
          setEditingValue(prev => prev.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta && /^\d$/.test(input)) {
          // Only allow digits
          setEditingValue(prev => prev + input);
        }
      } else {
        // Normal settings navigation
        if (key.escape) {
          setShowSettings(false);
        } else if (key.tab) {
          setSettingsTab(prev => prev === 'general' ? 'instance' : 'general');
        } else if (input === 'g' && settingsTab === 'general') {
          toggleGlobalAutoRestart();
        } else if (input === 'r' && settingsTab === 'instance' && instances.length > 0) {
          toggleInstanceAutoRestart(instances[selectedInstance]?.id);
        } else if (input === 'e' && settingsTab === 'general') {
          // Edit default threshold
          startEditing('defaultThreshold', defaultInactivityThreshold.toString());
        } else if (input === 'e' && settingsTab === 'instance' && instances.length > 0) {
          // Edit instance threshold
          const instanceId = instances[selectedInstance]?.id;
          const currentValue = instances[selectedInstance]?.inactivityThreshold || defaultInactivityThreshold;
          startEditing(`instanceThreshold:${instanceId}`, currentValue.toString());
        } else if (key.leftArrow && selectedInstance > 0) {
          setSelectedInstance(selectedInstance - 1);
        } else if (key.rightArrow && selectedInstance < instances.length - 1) {
          setSelectedInstance(selectedInstance + 1);
        }
      }
      return;
    }

    // Main interface navigation
    if (key.leftArrow && selectedInstance > 0) {
      setSelectedInstance(selectedInstance - 1);
    } else if (key.rightArrow && selectedInstance < instances.length - 1) {
      setSelectedInstance(selectedInstance + 1);
    } else if (input === 'n') {
      createInstance();
    } else if (input === 'd' && instances.length > 0) {
      removeInstance(instances[selectedInstance]?.id);
    } else if (input === 'p' && instances.length > 0) {
      // Clear terminal before showing command input
      process.stdout.write('\x1B[2J\x1B[0f');
      setShowCommandInput(true);
    } else if (key.return && instances.length > 0) {
      // Enter key opens full screen view
      process.stdout.write('\x1B[2J\x1B[0f');
      setShowFullScreen(true);
    } else if (input === 's') {
      // Show settings panel
      setShowSettings(true);
    } else if (input === 'r' && instances.length > 0) {
      // Toggle auto-restart for selected instance
      toggleInstanceAutoRestart(instances[selectedInstance]?.id);
    } else if (input === 'a' && instances.length > 0 && instances[selectedInstance]?.pendingCommand) {
      // Approve pending command for selected instance
      approveCommand(instances[selectedInstance]?.id);
    } else if (input === 'x' && instances.length > 0 && instances[selectedInstance]?.pendingCommand) {
      // Reject pending command for selected instance
      rejectCommand(instances[selectedInstance]?.id);
    } else if (input === 'q') {
      handleExit();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
        <Box marginBottom={1}>
          <Spinner type="dots" />
          <Text> Initializing Amp Manager...</Text>
        </Box>
        <Text color="gray" dimColor>Press Ctrl+C to cancel</Text>
      </Box>
    );
  }

  // Show full screen view for selected instance
  if (showFullScreen && instances.length > 0) {
    const currentInstance = instances[selectedInstance];
    return (
      <FullScreenView
        instance={currentInstance}
        onExit={() => setShowFullScreen(false)}
        onSendPrompt={(prompt: string) => sendPrompt(currentInstance.id, prompt)}
        onCreateThread={() => createThread(currentInstance.id)}
        onToggleAutoRestart={() => toggleInstanceAutoRestart(currentInstance.id)}
        onSwitchThread={(threadId: string) => {
          // Switch thread functionality would be implemented here
          addLog(`🔄 Switching to thread: ${threadId.slice(0, 16)}...`);
        }}
        onApproveCommand={() => approveCommand(currentInstance.id)}
        onRejectCommand={() => rejectCommand(currentInstance.id)}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box marginBottom={1} paddingX={1} borderStyle="single" borderColor="blue">
        <Text color="blue" bold>
          🎛️  Manager - Session: {sessionName} | Port: {port} | Instances: {instances.length}
        </Text>
      </Box>

      {/* Enhanced Settings Panel */}
      {showSettings && (
        <Box 
          marginBottom={1} 
          paddingX={2} 
          paddingY={1} 
          borderStyle="double" 
          borderColor="cyan"
          height={16}
        >
          <Box flexDirection="column" width="100%">
            <Box marginBottom={1}>
              <Text color="cyan" bold>
                ⚙️  Settings Panel
              </Text>
            </Box>
            
            {/* Tab Navigation */}
            <Box marginBottom={1}>
              <Text color={settingsTab === 'general' ? "cyan" : "gray"} bold>
                [General]
              </Text>
              <Text color="gray"> | </Text>
              <Text color={settingsTab === 'instance' ? "cyan" : "gray"} bold>
                [Instance]
              </Text>
              <Text color="gray" dimColor> (Tab to switch)</Text>
            </Box>
            
            {settingsTab === 'general' && (
              <Box flexDirection="column">
                <Box marginBottom={1}>
                  <Text color="yellow">Global Auto-restart: </Text>
                  <Text color={globalAutoRestart ? "green" : "red"} bold>
                    {globalAutoRestart ? "ENABLED" : "DISABLED"}
                  </Text>
                  <Text color="gray" dimColor> (Press 'g' to toggle)</Text>
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Default Inactivity Threshold: </Text>
                  {editingField === 'defaultThreshold' ? (
                    <>
                      <Text color="cyan" bold>[{editingValue}]</Text>
                      <Text color="cyan">█</Text>
                      <Text color="gray" dimColor> seconds (Enter: save, Esc: cancel)</Text>
                    </>
                  ) : (
                    <>
                      <Text color="white" bold>{defaultInactivityThreshold} seconds</Text>
                      <Text color="gray" dimColor> ({Math.floor(defaultInactivityThreshold / 60)}m {defaultInactivityThreshold % 60}s) (Press 'e' to edit)</Text>
                    </>
                  )}
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Watchdog Check Interval: </Text>
                  <Text color="white">30 seconds</Text>
                  <Text color="gray" dimColor> (system default)</Text>
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">New Instance Defaults: </Text>
                  <Text color="gray">Auto-restart: </Text>
                  <Text color={globalAutoRestart ? "green" : "red"}>{globalAutoRestart ? "ON" : "OFF"}</Text>
                  <Text color="gray"> | Timeout: </Text>
                  <Text color="white">{defaultInactivityThreshold}s</Text>
                </Box>
              </Box>
            )}
            
            {settingsTab === 'instance' && instances.length > 0 && (
              <Box flexDirection="column">
                <Box marginBottom={1}>
                  <Text color="yellow">Selected: </Text>
                  <Text color="cyan" bold>{instances[selectedInstance]?.name}</Text>
                  <Text color="gray"> ({instances[selectedInstance]?.id.slice(0, 8)})</Text>
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Auto-restart: </Text>
                  <Text color={instances[selectedInstance]?.config.autoRestart ? "green" : "red"} bold>
                    {instances[selectedInstance]?.config.autoRestart ? "ENABLED" : "DISABLED"}
                  </Text>
                  <Text color="gray" dimColor> (Press 'r' to toggle)</Text>
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Inactivity Threshold: </Text>
                  {editingField === `instanceThreshold:${instances[selectedInstance]?.id}` ? (
                    <>
                      <Text color="cyan" bold>[{editingValue}]</Text>
                      <Text color="cyan">█</Text>
                      <Text color="gray" dimColor> seconds (Enter: save, Esc: cancel)</Text>
                    </>
                  ) : (
                    <>
                      <Text color="white" bold>{instances[selectedInstance]?.inactivityThreshold} seconds</Text>
                      <Text color="gray" dimColor> ({Math.floor((instances[selectedInstance]?.inactivityThreshold || 0) / 60)}m {(instances[selectedInstance]?.inactivityThreshold || 0) % 60}s) (Press 'e' to edit)</Text>
                    </>
                  )}
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Status: </Text>
                  <Text color="white">{instances[selectedInstance]?.status}</Text>
                  <Text color="gray"> | Auth: </Text>
                  <Text color={instances[selectedInstance]?.authStatus === 'authenticated' ? "green" : "red"}>
                    {instances[selectedInstance]?.authStatus}
                  </Text>
                </Box>
                
                <Box marginBottom={1}>
                  <Text color="yellow">Stats: </Text>
                  <Text color="gray">Prompts: </Text>
                  <Text color="white">{instances[selectedInstance]?.stats.promptsExecuted}</Text>
                  <Text color="gray"> | Restarts: </Text>
                  <Text color="orange">{instances[selectedInstance]?.stats.restartCount}</Text>
                </Box>
              </Box>
            )}
            
            {settingsTab === 'instance' && instances.length === 0 && (
              <Box>
                <Text color="gray" italic>No instances available. Create an instance first.</Text>
              </Box>
            )}
            
            <Box>
              <Text color="gray" dimColor>
                {editingField ? (
                  "EDITING: Type numbers | Enter: Save | Esc: Cancel"
                ) : (
                  "ESC: Close | Tab: Switch Tabs | g: Toggle Global | r: Toggle Instance | e: Edit | ← → Navigate Instances"
                )}
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Instance panels */}
      <Box flexGrow={1} flexDirection="row">
        {instances.length === 0 ? (
          <Box flexGrow={1} alignItems="center" justifyContent="center">
            <Text color="gray">
              No instances running. Press 'n' to create a new instance.
            </Text>
          </Box>
        ) : (
          instances.map((instance, index) => (
            <InstancePanel
              key={`${instance.id}-${refreshTrigger}`}
              instance={instance}
              isSelected={index === selectedInstance}
              onSendPrompt={(prompt: string) => sendPrompt(instance.id, prompt)}
            />
          ))
        )}
      </Box>

      {/* Command input overlay */}
      {showCommandInput && instances.length > 0 && (
        <CommandInput
          instanceName={instances[selectedInstance]?.name || ''}
          workingDirectory={instances[selectedInstance]?.workingDirectory}
          onSubmit={(prompt: string) => {
            sendPrompt(instances[selectedInstance]?.id, prompt);
            setShowCommandInput(false);
          }}
          onCancel={() => setShowCommandInput(false)}
        />
      )}

      {/* Status bar and logs */}
      <StatusBar
        instances={instances}
        selectedInstance={selectedInstance}
        logs={logs.slice(-3)}
      />

      {/* Help */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text color="gray" dimColor>
          {instances.length > 0 && instances[selectedInstance]?.pendingCommand ? (
            "Controls: ← → Navigate | a APPROVE | x REJECT | p Prompt | r Toggle Restart | s Settings | Enter Full Screen | q Quit"
          ) : (
            "Controls: ← → Navigate | n New | d Delete | p Prompt | r Toggle Restart | s Settings | Enter Full Screen | q Quit"
          )}
        </Text>
      </Box>
    </Box>
  );
}; 