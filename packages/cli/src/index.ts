#!/usr/bin/env bun
import { startServer } from '@desk/server';
import { runDoctor } from './commands/doctor';
import { printHelp } from './commands/help';
import { runMcp } from './commands/mcp';
import { runWhere } from './commands/where';

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case undefined:
    case 'start':
      return runStart();
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

async function runStart(): Promise<void> {
  const running = await startServer();
  const url = `http://${running.config.host}:${running.config.port}`;
  console.log(banner(url));

  void openInBrowser(url);

  const shutdown = async () => {
    console.log('\nShutting down…');
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function banner(url: string): string {
  return [
    '',
    '  Desk · v0.1.0',
    `  Viewer    ${url}`,
    `  MCP       ${url}/mcp`,
    `  WebSocket ${url.replace(/^http/, 'ws')}/ws`,
    '',
    '  Press ⌘C to quit.',
    '',
  ].join('\n');
}

async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const bin = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    await Bun.spawn([bin, url], { stdout: 'ignore', stderr: 'ignore' }).exited;
  } catch {
    /* the URL is already in the banner, so a failed launch is recoverable */
  }
}

void main();
