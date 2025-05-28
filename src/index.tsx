#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { AmpManager } from './components/AmpManager.js';

const program = new Command();

// Clear terminal on startup
process.stdout.write('\x1B[2J\x1B[0f');

// Handle clean exit
process.on('SIGINT', () => {
  process.stdout.write('\x1B[2J\x1B[0f');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stdout.write('\x1B[2J\x1B[0f');
  process.exit(0);
});

program
  .name('amp-manager')
  .description('Visual manager for multiple Amp CLI instances')
  .version('1.0.0')
  .option('-s, --session <n>', 'tmux session name', 'amp-manager')
  .option('-p, --port <number>', 'control socket port', '8080')
  .action((options: { session: string; port: string }) => {
    const { unmount } = render(<AmpManager sessionName={options.session} port={parseInt(options.port)} />);
    
    // Handle app exit cleanup
    const cleanup = () => {
      unmount();
      process.stdout.write('\x1B[2J\x1B[0f');
      process.exit(0);
    };
    
    process.on('exit', cleanup);
  });

program.parse(); 