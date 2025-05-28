#!/usr/bin/env node

// Example WebSocket client for controlling the Amp Manager
// Usage: node examples/websocket-client.js

import WebSocket from 'ws';

class AmpManagerClient {
  constructor(port = 8080) {
    this.port = port;
    this.ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      
      this.ws.on('open', () => {
        console.log('🔗 Connected to Amp Manager');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        console.log('📨 Response:', response);
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

  sendCommand(type, payload = {}) {
    const message = {
      type,
      payload,
      requestId: `req-${Date.now()}`
    };
    
    console.log('📤 Sending:', message);
    this.ws.send(JSON.stringify(message));
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Example usage
async function demo() {
  const client = new AmpManagerClient();
  
  try {
    await client.connect();
    
    // Wait a bit then send some commands
    setTimeout(() => {
      console.log('\n🧪 Testing commands...\n');
      
      // List current instances
      client.sendCommand('list_instances');
      
      // Create a new instance
      setTimeout(() => {
        client.sendCommand('create_instance', { 
          name: 'demo-agent',
          initialPrompt: 'Hello from WebSocket API!'
        });
      }, 1000);
      
      // Get status
      setTimeout(() => {
        client.sendCommand('get_status');
      }, 2000);
      
      // Disconnect after demo
      setTimeout(() => {
        client.disconnect();
      }, 5000);
      
    }, 1000);
    
  } catch (error) {
    console.error('Failed to connect:', error);
    console.log('\nMake sure the Amp Manager is running with:');
    console.log('npm start');
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

export { AmpManagerClient }; 