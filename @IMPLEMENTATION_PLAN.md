# Implementation Plan

## Current Status: Build Failing

### Critical Issues (Priority 1)

1. **node-pty build failure** - Native module compilation error
   - Error: 'memory' file not found during node-pty compilation
   - Impact: Cannot install dependencies, blocks all development
   - Options considered:
     - Remove node-pty dependency and use alternative
     - Fix compilation environment 
     - Use pre-built binaries
     - Docker environment for consistent builds
   - **Selected approach**: Create Docker environment first for consistent builds

2. **Missing TypeScript compilation** - tsc not found
   - Dependencies not installed due to node-pty failure
   - Need functioning build pipeline

### Implementation Status

#### Completed ✅
- [x] Specifications created in `specs/` directory
- [x] AGENT.md updated with development workflow
- [x] SPECS.md overview document created

#### In Progress 🚧
- [ ] Build environment setup
- [ ] Docker container configuration

#### Not Started ❌
- [ ] Core functionality implementation
- [ ] Test framework setup
- [ ] WebSocket API implementation
- [ ] UI component completion
- [ ] File mention support
- [ ] Thread management
- [ ] Security/approval system

### Next Steps

1. ✅ Create Docker environment for consistent builds
2. ✅ Remove node-pty dependency and fix compilation 
3. ✅ Complete TypeScript build setup
4. ✅ Implement core components (All components fully implemented!)
5. 🚧 Fix test suite issues:
   - Mock fs.mkdir properly for TmuxManager
   - Fix ControlSocket close() method
   - Update AmpLogMonitor API methods
   - Fix session initialization in tests

### Test Issues Found

#### Critical Issues ❌
1. **TmuxManager**: `fs.mkdir` mocking issues, session not initialized
2. **ControlSocket**: Missing `close()` method, WebSocket mocking problems  
3. **AmpLogMonitor**: Missing public methods (`start`, `stop`, `getLastActivity`)
4. **Mocking Problems**: Need proper mocks for fs, WebSocket, child_process

### Docker Priority

Creating Docker container first to:
- Avoid native compilation issues
- Ensure consistent environment across platforms
- Include tmux and all required dependencies
- Support amp CLI installation and authentication
