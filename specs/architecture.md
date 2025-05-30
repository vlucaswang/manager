# Architecture Specification

## Overview
Amp Manager is a visual supervisor for multiple Amp CLI instances built with React/Ink for terminal UI, tmux for process management, and WebSocket for remote control.

## Core Components

### Entry Point (`src/index.tsx`)
- CLI application using Commander.js
- Signal handling and cleanup
- React/Ink rendering setup

### Manager Component (`src/components/AmpManager.tsx`)
- Central orchestrator
- Keyboard navigation
- Global state management

## Service Layer

### TmuxManager (`src/services/TmuxManager.ts`)
- Process lifecycle management
- Health monitoring and watchdog
- Authentication tracking
- Command approval workflow

### ControlSocket (`src/services/ControlSocket.ts`)
- WebSocket server (port 8080)
- Remote control API
- Real-time event streaming

### AmpLogMonitor (`src/services/AmpLogMonitor.ts`)
- Log file parsing
- State detection and tracking
- Activity monitoring

## Data Architecture

### Core Types (`src/types/AmpInstance.ts`)
- AmpInstance: Complete state model
- InstanceConfig: Configuration schema
- Control/Response messages
- Event system types

## Design Patterns
- Event-driven architecture
- Service layer separation
- Configuration-driven behavior
- Process isolation via tmux
