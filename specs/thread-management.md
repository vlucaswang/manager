# Thread Management Specification

## Overview
Thread management allows continuation of amp CLI conversations across instance restarts and enables parallel conversation contexts.

## Core Features

### Thread Creation
- Press `t` in full-screen view
- Creates new conversation context
- Generates unique thread ID
- Instance switches to new thread

### Thread Switching
- Continue existing conversations
- Thread ID stored in instance config
- Automatic thread resumption on restart

### Thread Continuity
- Persistent across instance restarts
- Configuration includes `threadId` parameter
- Working directory awareness

## Implementation

### Thread Storage
```typescript
interface AmpInstance {
  threadId?: string;
  config: {
    threadId?: string; // For continuation
  }
}
```

### WebSocket Commands
- `create_thread`: Generate new thread
- `switch_thread`: Change active thread
- `list_threads`: Show available threads

### amp CLI Integration
- Uses amp's native thread system
- Thread IDs extracted from output
- Commands: `amp --thread-id=...`

## Use Cases

### Development Workflows
- Separate threads for different features
- Parallel debugging sessions
- Context isolation for different tasks

### Conversation Management
- Resume interrupted conversations
- Switch between multiple ongoing tasks
- Maintain conversation history
