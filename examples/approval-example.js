#!/usr/bin/env node

/**
 * Example: Command Approval Workflow
 * 
 * This example demonstrates how to:
 * 1. Create an instance with approval required
 * 2. Send a command that requires approval
 * 3. Monitor for approval requests
 * 4. Approve or reject commands via WebSocket API
 */

import WebSocket from 'ws';

const MANAGER_PORT = 3001; // Default amp-manager port

class ApprovalExample {
  constructor() {
    this.ws = null;
    this.instanceId = null;
  }

  async connect() {
    this.ws = new WebSocket(`ws://localhost:${MANAGER_PORT}`);
    
    this.ws.on('open', () => {
      console.log('✅ Connected to Amp Manager');
      this.runExample();
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
  }

  sendCommand(type, payload = {}) {
    const message = {
      type,
      payload,
      requestId: Date.now().toString()
    };
    
    console.log(`📤 Sending: ${type}`);
    this.ws.send(JSON.stringify(message));
  }

  handleMessage(message) {
    if (message.type === 'agent_event') {
      const event = message.data;
      
      if (event.type === 'approval_required') {
        console.log(`⚠️  APPROVAL REQUIRED for instance ${event.instanceId}`);
        console.log(`   Command: ${event.data.prompt}`);
        console.log(`   
   Options:
   - Send approve_command to approve
   - Send cancel_command to reject
        `);
        
        // Auto-approve for demo (in real usage, this would be manual)
        setTimeout(() => {
          console.log('✅ Auto-approving command for demo...');
          this.sendCommand('approve_command', { instanceId: event.instanceId });
        }, 2000);
      }
      
      if (event.type === 'status_changed') {
        console.log(`📊 Status changed: ${event.instanceId} -> ${event.data.status}`);
      }
    }
    
    if (message.success === false) {
      console.error(`❌ Error: ${message.error}`);
    }
    
    if (message.data) {
      this.handleResponse(message);
    }
  }

  handleResponse(message) {
    const { data } = message;
    
    if (data.id && !this.instanceId) {
      // Instance created
      this.instanceId = data.id;
      console.log(`🎯 Created instance: ${data.name} (${data.id.slice(0, 8)})`);
      
      // Enable event streaming
      this.sendCommand('get_agent_stream', { enabled: true });
      
      // Send a command that requires approval
      setTimeout(() => {
        console.log('📝 Sending command that requires approval...');
        this.sendCommand('send_prompt', {
          instanceId: this.instanceId,
          prompt: 'rm -rf /etc/passwd  # This should require approval!'
        });
      }, 3000);
    }
  }

  async runExample() {
    console.log('🚀 Starting approval workflow example...');
    
    // Create instance with approval required
    const config = {
      name: 'approval-demo',
      requireApproval: true,
      ampSettings: {
        'amp.commands.allowlist': [
          'ls',
          'pwd',
          'git status'
        ]
      }
    };
    
    this.sendCommand('create_instance', config);
  }

  async cleanup() {
    if (this.instanceId) {
      console.log('🧹 Cleaning up instance...');
      this.sendCommand('destroy_instance', { instanceId: this.instanceId });
    }
    
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run the example
console.log('🔒 Amp Manager Approval Example');
console.log('================================');
console.log('Make sure amp-manager is running on port 3001');
console.log('');

const example = new ApprovalExample();

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  example.cleanup();
});

example.connect(); 