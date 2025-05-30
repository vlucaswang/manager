# UI Components Specification

## Overview
React/Ink-based terminal UI components providing visual management interface for amp instances.

## Core Components

### AmpManager (Main Component)
- Central orchestrator and state manager
- Keyboard event handling
- Navigation between views
- Global controls and settings

### InstancePanel
```typescript
interface InstancePanelProps {
  instance: AmpInstance;
  isSelected: boolean;
  showOutput: boolean;
}
```
- Individual instance display
- Status indicators and uptime
- Command approval interface
- Real-time output preview

### FullScreenView
- Enhanced single-instance view
- Scrollable output history
- Inline prompt input
- Thread management controls
- Navigation: ↑/↓ for scrolling, ESC to exit

### CommandInput
- Prompt input with file mention support
- `@filename` auto-completion
- Tab navigation for file search
- Working directory awareness

### StatusBar
- Global system status
- Running/idle/error instance counts
- Recent activity log
- Selected instance indicator

## Keyboard Controls

### Dashboard View
- `←`/`→`: Navigate instances
- `n`: Create new instance
- `d`: Delete instance (with confirmation)
- `p`: Send prompt
- `r`: Toggle auto-restart
- `a`/`x`: Approve/reject commands
- `s`: Settings panel
- `Enter`: Full-screen view
- `q`: Quit application

### Full-Screen View
- `p`: Send prompt
- `t`: Create new thread
- `↑`/`↓`: Scroll output
- `ESC`/`q`: Return to dashboard

### Settings Panel
- `Tab`: Switch between tabs
- `g`: Toggle global auto-restart
- `←`/`→`: Navigate instances
- `ESC`: Close panel

## Visual Design

### Color Coding
- Green: Active/healthy states
- Red: Error states
- Yellow: Warning/pending states
- Blue: Information states
- Magenta: Approval required

### Status Indicators
- Authentication status icons
- Auto-restart toggle states
- Thread ID display
- Uptime counters
- Activity timestamps

### Layout
- Split-screen dashboard
- Responsive terminal sizing
- Scrollable content areas
- Modal overlays for settings
