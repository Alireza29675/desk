/**
 * `desk init claude-code` — wire Desk into Claude Code without the plugin.
 *
 * Registers BOTH surfaces via the `claude` CLI, byte-aligned with the plugin's
 * .mcp.json: `desk` (HTTP tools at /mcp) and `desk-channel` (stdio live-push
 * bridge). If `claude` isn't on PATH we print the exact commands + snippet so
 * the user can paste them. This is the non-plugin path; the plugin remains the
 * zero-touch one.
 */
const VALID_SCOPES = ['local', 'user', 'project'] as const;
type Scope = (typeof VALID_SCOPES)[number];

export interface InitStep {
  name: string;
  args: string[];
}

/** The MCP endpoint Desk serves, from the same env the rest of the CLI reads. */
export function mcpEndpoint(): string {
  const host = process.env.DESK_HOST ?? '127.0.0.1';
  const port = process.env.DESK_PORT ?? '7878';
  return `http://${host}:${port}/mcp`;
}

/**
 * The two `claude mcp add` invocations, as arg arrays (no shell). Order matters:
 * options precede the server name, and the stdio command follows `--`.
 */
export function buildInitSteps(endpoint: string, scope: Scope): InitStep[] {
  return [
    {
      name: 'desk',
      args: ['mcp', 'add', '--transport', 'http', '--scope', scope, 'desk', endpoint],
    },
    {
      name: 'desk-channel',
      args: ['mcp', 'add', '--scope', scope, 'desk-channel', '--', 'desk-channel'],
    },
  ];
}

/**
 * The .mcp.json Desk wants in Claude Code — identical in shape to the plugin's,
 * so the CLI path and the plugin path register the same two servers.
 */
export function manualSnippet(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        desk: { type: 'http', url: endpoint },
        'desk-channel': { command: 'desk-channel' },
      },
    },
    null,
    2,
  );
}

/** Parse `--scope`/`-s`; returns the scope, or null if an invalid value was given. */
export function parseScope(rest: string[]): Scope | null {
  // Accept `--scope user`, `-s user`, and the GNU `--scope=user` form — the
  // last reflexively typed and otherwise silently ignored (→ wrong scope).
  let val: string | undefined;
  const eq = rest.find((a) => a.startsWith('--scope='));
  if (eq) {
    val = eq.slice('--scope='.length);
  } else {
    const i = rest.findIndex((a) => a === '--scope' || a === '-s');
    if (i < 0) return 'user'; // install-once-use-everywhere default
    val = rest[i + 1];
  }
  return val && (VALID_SCOPES as readonly string[]).includes(val) ? (val as Scope) : null;
}

export type AddOutcome = 'registered' | 'already' | 'failed';

/**
 * Classify a `claude mcp add` result. A duplicate add exits non-zero with an
 * "already exists" message (verified against claude v2.1.175:
 * "MCP server <name> already exists in local config") — treat that as success
 * so re-running `init` is idempotent. Any other non-zero exit is a real failure.
 */
export function classifyAddResult(exitCode: number | null, output: string): AddOutcome {
  if (exitCode === 0) return 'registered';
  if (/already (exists|configured|added)/i.test(output)) return 'already';
  return 'failed';
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function runInit(rest: string[]): void {
  const target = rest[0] ?? 'claude-code';
  if (target !== 'claude-code') {
    console.error(`unknown init target "${target}". Supported: claude-code.`);
    process.exit(1);
  }

  const scope = parseScope(rest);
  if (scope === null) {
    console.error('invalid --scope. Use one of: local, user, project.');
    process.exit(1);
  }

  const endpoint = mcpEndpoint();
  const steps = buildInitSteps(endpoint, scope);

  if (rest.includes('--dry-run')) {
    console.log('# Would run:');
    for (const s of steps) console.log(`  claude ${s.args.join(' ')}`);
    return;
  }

  const claude = Bun.which('claude');
  if (!claude) {
    console.error('`claude` CLI not found on PATH. Register Desk manually:\n');
    for (const s of steps) console.error(`  claude ${s.args.join(' ')}`);
    console.error('\nOr add this to your Claude Code .mcp.json:');
    console.error(manualSnippet(endpoint));
    console.error(
      '\nNote: desk-channel (live push) loads only with `claude --dangerously-load-development-channels server:desk-channel`.',
    );
    process.exit(1);
  }

  const done: string[] = [];
  for (const step of steps) {
    const res = Bun.spawnSync([claude, ...step.args], { stdout: 'pipe', stderr: 'pipe' });
    const output = (decode(res.stdout) + decode(res.stderr)).trim();
    const outcome = classifyAddResult(res.exitCode, output);
    if (outcome === 'registered') {
      console.log(`✓ registered ${step.name}`);
      done.push(step.name);
    } else if (outcome === 'already') {
      console.log(`✓ ${step.name} already registered`);
      done.push(step.name);
    } else {
      console.error(`✗ failed to register ${step.name}:\n${output}`);
      if (done.length > 0) {
        // Honest about the half-wired state + how to recover or undo.
        console.error(
          `\nAlready registered: ${done.join(', ')}. Re-run \`desk init claude-code\` to retry, or \`claude mcp remove <name>\` to undo.`,
        );
      }
      process.exit(1);
    }
  }

  console.log(
    [
      '',
      `Desk's tools are registered in Claude Code (${scope} scope). Restart Claude Code to load them.`,
      '',
      'Note: `desk-channel` (live comment push) is a Claude Code preview channel — it activates only',
      'when you launch with the development flag:',
      '  claude --dangerously-load-development-channels server:desk-channel',
      "Without it, Desk's tools still work and viewer comments arrive via the `get_artifact` tool",
      '(pull); the channel only adds live push. `desk-channel` resolves via PATH — it needs a global',
      'Desk install.',
      '',
      'Tip: run `desk` (or `desk start`) first so the server is up.',
    ].join('\n'),
  );
}
