import { afterEach, describe, expect, it } from 'vitest';
import { buildInitSteps, classifyAddResult, manualSnippet, mcpEndpoint, parseScope } from './init';

describe('mcpEndpoint', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to 127.0.0.1:7878/mcp', () => {
    // Remove the keys entirely — setting them to undefined would stringify to
    // "undefined" and defeat the `?? default` fallback mcpEndpoint relies on.
    process.env = Object.fromEntries(
      Object.entries(saved).filter(([k]) => k !== 'DESK_HOST' && k !== 'DESK_PORT'),
    );
    expect(mcpEndpoint()).toBe('http://127.0.0.1:7878/mcp');
  });

  it('honors DESK_HOST and DESK_PORT', () => {
    process.env.DESK_HOST = '0.0.0.0';
    process.env.DESK_PORT = '7910';
    expect(mcpEndpoint()).toBe('http://0.0.0.0:7910/mcp');
  });
});

describe('parseScope', () => {
  it('defaults to user (install-once-use-everywhere)', () => {
    expect(parseScope([])).toBe('user');
    expect(parseScope(['claude-code'])).toBe('user');
  });

  it('reads --scope and -s', () => {
    expect(parseScope(['--scope', 'local'])).toBe('local');
    expect(parseScope(['-s', 'project'])).toBe('project');
  });

  it('reads the GNU --scope=value form (otherwise silently ignored → wrong scope)', () => {
    expect(parseScope(['--scope=local'])).toBe('local');
    expect(parseScope(['claude-code', '--scope=project'])).toBe('project');
  });

  it('returns null for an invalid scope value', () => {
    expect(parseScope(['--scope', 'global'])).toBeNull();
    expect(parseScope(['--scope'])).toBeNull(); // missing value
    expect(parseScope(['--scope=bogus'])).toBeNull();
  });
});

describe('classifyAddResult — idempotency pinned to the real claude wording', () => {
  it('treats exit 0 as registered', () => {
    expect(classifyAddResult(0, 'Added HTTP MCP server desk ...')).toBe('registered');
  });

  it('treats the v2.1.175 duplicate message as already-registered (not a failure)', () => {
    expect(classifyAddResult(1, 'MCP server desk already exists in local config')).toBe('already');
    expect(classifyAddResult(1, 'desk-channel already added')).toBe('already');
  });

  it('treats any other non-zero exit as a real failure', () => {
    expect(classifyAddResult(1, 'Error: connection refused')).toBe('failed');
    expect(classifyAddResult(null, '')).toBe('failed');
  });
});

describe('buildInitSteps — byte-aligned with the plugin .mcp.json', () => {
  const endpoint = 'http://127.0.0.1:7878/mcp';

  it('registers desk over HTTP at /mcp', () => {
    const [desk] = buildInitSteps(endpoint, 'user');
    expect(desk).toEqual({
      name: 'desk',
      args: ['mcp', 'add', '--transport', 'http', '--scope', 'user', 'desk', endpoint],
    });
  });

  it('registers desk-channel as a stdio command after `--`', () => {
    const [, channel] = buildInitSteps(endpoint, 'user');
    expect(channel).toEqual({
      name: 'desk-channel',
      args: ['mcp', 'add', '--scope', 'user', 'desk-channel', '--', 'desk-channel'],
    });
  });

  it('threads the chosen scope into both steps', () => {
    const steps = buildInitSteps(endpoint, 'project');
    expect(steps.every((s) => s.args.includes('--scope') && s.args.includes('project'))).toBe(true);
  });
});

describe('manualSnippet — same two servers as the plugin', () => {
  it('emits desk (http) + desk-channel (stdio command) with the canonical shape', () => {
    const endpoint = 'http://127.0.0.1:7878/mcp';
    const parsed = JSON.parse(manualSnippet(endpoint));
    expect(parsed).toEqual({
      mcpServers: {
        desk: { type: 'http', url: endpoint },
        'desk-channel': { command: 'desk-channel' },
      },
    });
  });
});
