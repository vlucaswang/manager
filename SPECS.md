# Amp Manager Specifications

## Overview
This document provides an overview of all technical specifications for the Amp Manager project - a visual supervisor and manager for multiple Amp CLI instances.

## Specification Documents

| Domain | Description | File |
|--------|-------------|------|
| **Architecture** | Core system architecture, components, and design patterns | [architecture.md](specs/architecture.md) |
| **Security** | Command approval system, allowlisting, and audit logging | [security.md](specs/security.md) |
| **Thread Management** | Conversation thread creation, switching, and continuity | [specs/thread-management.md](specs/thread-management.md) |
| **File Mentions** | `@filename` syntax, fuzzy search, and auto-completion | [specs/file-mentions.md](specs/file-mentions.md) |
| **Monitoring** | Health monitoring, error detection, and watchdog systems | [specs/monitoring.md](specs/monitoring.md) |
| **Settings Management** | Configuration hierarchy, persistence, and runtime modification | [specs/settings-management.md](specs/settings-management.md) |
| **WebSocket API** | Real-time control API, commands, and event streaming | [specs/websocket-api.md](specs/websocket-api.md) |
| **UI Components** | React/Ink components, keyboard controls, and visual design | [specs/ui-components.md](specs/ui-components.md) |
| **Process Management** | Tmux integration, instance lifecycle, and error recovery | [specs/process-management.md](specs/process-management.md) |

## Key Features

### 🧵 Thread Management
Multi-conversation support with thread creation, switching, and continuity across restarts.

### 📁 File Mention Support  
Fuzzy file search with `@filename` syntax and Tab navigation for enhanced productivity.

### ⚙️ Settings Management
Hierarchical configuration with global defaults and per-instance overrides.

### 🛡️ Enhanced Security
Command approval workflows, allowlisting, and comprehensive audit logging.

### 📊 Advanced Monitoring
Real-time health monitoring, authentication tracking, and error pattern detection.

### 🌐 WebSocket API
Comprehensive remote control API with real-time event streaming.

### 🎮 Terminal UI
React/Ink-based interface with keyboard navigation and visual status indicators.

### ⚡ Process Management
Tmux-based process isolation with automatic lifecycle management.

## Development Workflow

1. Study specifications in `specs/` directory
2. Check `IMPLEMENTATION_PLAN.md` for current status
3. Resolve build issues and run tests
4. Update implementation plan and commit changes
5. Maintain single sources of truth, no migrations/adapters

## Getting Started

Refer to the main [README.md](README.md) for installation instructions and usage examples.
