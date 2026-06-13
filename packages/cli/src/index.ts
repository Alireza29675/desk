#!/usr/bin/env bun
import { runDoctor } from './commands/doctor';
import { printHelp } from './commands/help';
import { runInit } from './commands/init';
import {
  type StartOptions,
  runRestart,
  runServe,
  runStart,
  runStatus,
  runStop,
} from './commands/lifecycle';
import { runMcp } from './commands/mcp';
import { runWhere } from './commands/where';

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case undefined:
      // Bare `desk`: ensure the server is running and open the viewer.
      return runStart({ open: true });
    case 'serve':
      return runServe();
    case 'start':
      return runStart(parseStartOptions(rest));
    case 'stop':
      await runStop();
      return;
    case 'status':
      return runStatus();
    case 'restart':
      return runRestart(parseStartOptions(rest));
    case 'init':
      return runInit(rest);
    case 'mcp':
      return runMcp(rest);
    case 'where':
      return runWhere();
    case 'doctor':
      return runDoctor();
    case 'help':
    case '--help':
    case '-h':
      return printHelp();
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

function parseStartOptions(rest: string[]): StartOptions {
  return {
    open: rest.includes('--open'),
    foreground: rest.includes('--foreground') || rest.includes('-f'),
  };
}

void main();
