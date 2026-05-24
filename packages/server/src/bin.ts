#!/usr/bin/env bun
import { startServer } from './index';

async function main(): Promise<void> {
  const running = await startServer();
  const { host, port } = running.config;
  console.log(`Desk server listening on http://${host}:${port}`);
  console.log(`  MCP:       http://${host}:${port}/mcp`);
  console.log(`  WebSocket: ws://${host}:${port}/ws`);
  console.log(`  Health:    http://${host}:${port}/health`);

  const shutdown = async () => {
    console.log('\nShutting down…');
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
