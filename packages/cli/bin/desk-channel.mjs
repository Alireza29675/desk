#!/usr/bin/env bun
// Bin wrapper for `desk-channel` (the Claude Code stdio channel bridge).
// Prefers the bundled dist; falls back to the channel package source for dev.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'channel.js');
const entry = existsSync(distEntry)
  ? distEntry
  : join(here, '..', '..', 'channel', 'src', 'index.ts');
await import(pathToFileURL(entry).href);
