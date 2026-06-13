#!/usr/bin/env bun
// Permanent bundle pipeline for `@desk/cli`.
//
// Produces a publishable, install-and-run artifact for Bun:
//   ① build the viewer dist (vite build, decoupled from the tsc typecheck gate)
//   ② bundle the CLI + channel into single files (bun build --target=bun)
//   ③ ship the prebuilt viewer dist inside the package
//
// The workspace `@desk/*` deps get inlined by `bun build`, sidestepping the
// `workspace:*` publish problem; `bun:*` builtins stay runtime-resolved; only
// `puppeteer-core` (used by the channel) stays external as a real npm dep.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliDir, '..', '..');
const viewerDir = join(repoRoot, 'packages', 'viewer');

function run(cmd: string[], cwd: string): void {
  const result = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if (!result.success) {
    console.error(`\nCommand failed: ${cmd.join(' ')} (cwd: ${cwd})`);
    process.exit(1);
  }
}

// ① Build the viewer dist directly via vite — bypass the viewer's `build` npm
//    script so packaging is not gated on the viewer's tsc typecheck.
console.log('① Building viewer dist (vite build)…');
run(['bun', 'run', 'build:harness'], viewerDir);
run(['bunx', 'vite', 'build'], viewerDir);

// ② Bundle the CLI and channel into packages/cli/dist/.
console.log('② Bundling CLI + channel (bun build --target=bun)…');
const distDir = join(cliDir, 'dist');
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
run(
  [
    'bun',
    'build',
    '--target=bun',
    '--outfile',
    join(distDir, 'desk.js'),
    join(cliDir, 'src', 'index.ts'),
  ],
  repoRoot,
);
run(
  [
    'bun',
    'build',
    '--target=bun',
    '--external',
    'puppeteer-core',
    '--outfile',
    join(distDir, 'channel.js'),
    join(repoRoot, 'packages', 'channel', 'src', 'index.ts'),
  ],
  repoRoot,
);

// ③ Copy the prebuilt viewer dist into the package.
console.log('③ Copying prebuilt viewer dist into the package…');
const packagedViewer = join(cliDir, 'viewer');
rmSync(packagedViewer, { recursive: true, force: true });
mkdirSync(packagedViewer, { recursive: true });
cpSync(join(viewerDir, 'dist'), join(packagedViewer, 'dist'), { recursive: true });

console.log('✓ Bundle complete: dist/desk.js, dist/channel.js, viewer/dist/');
