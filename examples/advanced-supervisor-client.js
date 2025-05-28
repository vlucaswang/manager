#!/usr/bin/env node

// Advanced Supervisor WebSocket client for Amp Manager
// Demonstrates watchdog, approval workflow, and event streaming features
// Usage: node examples/advanced-supervisor-client.js

import WebSocket from 'ws';

class AdvancedSupervisorClient {
  constructor(port = 8080) {
    this.port = port;
    this.ws = null;
    this.eventStreamEnabled = false;
    this.instances = []; // Track created instances
    this.lastCreatedInstance = null; // Most recently created instance
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      
      this.ws.on('open', () => {
        console.log('🔗 Connected to Amp Manager (Advanced Supervisor)');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        
        if (response.type === 'agent_event') {
          this.handleAgentEvent(response.data);
        } else {
          console.log('📨 Response:', response);
          
          // Track created instances
          if (response.success && response.data && response.data.id && 
              response.requestId && response.requestId.includes('create_instance')) {
            this.instances.push(response.data);
            this.lastCreatedInstance = response.data;
            console.log(`✅ Tracked new instance: ${response.data.id.slice(0, 8)} (${response.data.name})`);
          }
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('🔌 Connection closed');
      });
    });
  }

  handleAgentEvent(event) {
    const severity = event.severity === 'error' || event.severity === 'critical' ? '🚨' : 
                    event.severity === 'warn' ? '⚠️' : '📊';
    
    console.log(`${severity} [${event.instanceId.slice(0, 8)}] ${event.type.toUpperCase()}`);
    console.log(`   Time: ${new Date(event.timestamp).toLocaleTimeString()}`);
    console.log(`   Data: ${JSON.stringify(event.data, null, 2)}`);
    
    // Auto-handle certain events
    if (event.type === 'approval_required') {
      console.log('🤖 Auto-approving command...');
      setTimeout(() => {
        this.approveCommand(event.instanceId);
      }, 2000);
    }
  }

  sendCommand(type, payload = {}) {
    const message = {
      type,
      payload,
      requestId: `req-${type}-${Date.now()}`
    };
    
    console.log('📤 Sending:', message);
    this.ws.send(JSON.stringify(message));
  }

  // Enable event streaming to monitor agent activity
  enableEventStream() {
    this.sendCommand('get_agent_stream', { enabled: true });
    this.eventStreamEnabled = true;
    console.log('🎯 Event streaming enabled');
  }

  // Create instance with advanced configuration
  createAdvancedInstance(name, config = {}) {
    const advancedConfig = {
      name,
      workingDirectory: process.cwd(),
      autoRestart: true,
      inactivityThreshold: 60, // 1 minute for demo
      requireApproval: true,
      errorPatterns: [
        'timeout',
        'error',
        'failed',
        'exception'
      ],
      logLevel: 'debug',
      environment: {
        DEMO_MODE: 'true',
        SUPERVISOR: 'advanced'
      },
      ...config
    };
    
    this.sendCommand('create_instance', advancedConfig);
  }

  // Get the most recently created instance ID or fallback to first one
  getLatestInstanceId() {
    if (this.lastCreatedInstance) {
      return this.lastCreatedInstance.id;
    }
    
    if (this.instances.length > 0) {
      return this.instances[0].id;
    }
    
    return null;
  }

  // Approve a pending command
  approveCommand(instanceId) {
    this.sendCommand('approve_command', { instanceId });
  }

  // Cancel a pending command
  cancelCommand(instanceId) {
    this.sendCommand('cancel_command', { instanceId });
  }

  // Manually restart an instance
  restartInstance(instanceId, reason = 'Manual restart') {
    this.sendCommand('restart_instance', { instanceId, reason });
  }

  // Send a prompt that requires approval
  sendPromptWithApproval(instanceId, prompt) {
    console.log(`🎯 Sending prompt requiring approval to ${instanceId.slice(0, 8)}:`);
    console.log(`   "${prompt}"`);
    this.sendCommand('send_prompt', { instanceId, prompt });
  }

  // Send prompt to latest instance
  sendPromptToLatest(prompt) {
    const instanceId = this.getLatestInstanceId();
    if (instanceId) {
      this.sendPromptWithApproval(instanceId, prompt);
    } else {
      console.log('❌ No instances available to send prompt to');
    }
  }

  // Restart latest instance
  restartLatestInstance(reason = 'Manual restart') {
    const instanceId = this.getLatestInstanceId();
    if (instanceId) {
      this.restartInstance(instanceId, reason);
    } else {
      console.log('❌ No instances available to restart');
    }
  }

  // Get comprehensive status
  getStatus() {
    this.sendCommand('get_status');
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Demo workflow
async function supervisorDemo() {
  const client = new AdvancedSupervisorClient();
  
  try {
    await client.connect();
    
    console.log('\n🎬 Starting Advanced Supervisor Demo...\n');
    
    // Enable event streaming first
    client.enableEventStream();
    
    setTimeout(() => {
      console.log('\n1️⃣ Creating supervised instance with approval workflow...');
      client.createAdvancedInstance('supervised-agent', {
        requireApproval: true,
        autoRestart: true,
        inactivityThreshold: 30 // 30 seconds for demo
      });
    }, 1000);

    setTimeout(() => {
      console.log('\n2️⃣ Getting system status...');
      client.getStatus();
    }, 3000);

    setTimeout(() => {
      console.log('\n3️⃣ Sending prompt that requires approval...');
      // Now using the latest created instance
      client.sendPromptToLatest('Create a simple Node.js HTTP server that responds with "Hello Supervisor!"');
    }, 6000);

    setTimeout(() => {
      console.log('\n4️⃣ Testing error detection by sending invalid prompt...');
      client.sendPromptToLatest('This will cause a timeout error for demonstration');
    }, 12000);

    setTimeout(() => {
      console.log('\n5️⃣ Manual restart test...');
      client.restartLatestInstance('Demo restart');
    }, 18000);

    setTimeout(() => {
      console.log('\n📊 Final status check...');
      client.getStatus();
    }, 22000);

    setTimeout(() => {
      console.log('\n✅ Demo complete - disconnecting...');
      client.disconnect();
    }, 25000);
    
  } catch (error) {
    console.error('Failed to connect:', error);
    console.log('\nMake sure the Amp Manager is running with:');
    console.log('npm start');
  }
}

// Manual control interface
function startManualMode() {
  const client = new AdvancedSupervisorClient();
  
  client.connect().then(() => {
    console.log('\n🎮 Manual Supervisor Mode - Available commands:');
    console.log('   stream     - Enable event streaming');
    console.log('   status     - Get system status');
    console.log('   create     - Create supervised instance');
    console.log('   prompt     - Send prompt to latest instance');
    console.log('   restart    - Restart latest instance');
    console.log('   exit       - Disconnect');
    
    // Enable streaming by default
    client.enableEventStream();
    
    // Simple command interface (in real app, use readline)
    process.stdin.on('data', (data) => {
      const command = data.toString().trim();
      
      switch (command) {
        case 'status':
          client.getStatus();
          break;
        case 'create':
          client.createAdvancedInstance(`agent-${Date.now()}`);
          break;
        case 'prompt':
          client.sendPromptToLatest('Hello from manual mode!');
          break;
        case 'restart':
          client.restartLatestInstance('Manual restart from console');
          break;
        case 'exit':
          client.disconnect();
          process.exit(0);
          break;
        default:
          console.log('Unknown command:', command);
      }
    });
  });
}

// Run demo or manual mode based on arguments
if (process.argv.includes('--manual')) {
  startManualMode();
} else {
  supervisorDemo();
}

export { AdvancedSupervisorClient }; 