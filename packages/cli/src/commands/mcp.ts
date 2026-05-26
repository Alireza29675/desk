/**
 * Print MCP registration snippets for common clients. Self-installing the
 * MCP wiring is open per the spec; for now we print, the user pastes. A
 * future cut can detect well-known config paths and edit them in place.
 */
export function runMcp(rest: string[]): void {
  const client = rest[0] ?? 'generic';
  const port = process.env.DESK_PORT ?? '7878';
  const host = process.env.DESK_HOST ?? '127.0.0.1';
  const endpoint = `http://${host}:${port}/mcp`;

  switch (client) {
    case 'claude-desktop':
      printClaudeDesktop(endpoint);
      return;
    case 'cursor':
      printCursor(endpoint);
      return;
    default:
      printGeneric(endpoint);
      return;
  }
}

function printClaudeDesktop(endpoint: string): void {
  console.log(
    [
      '# Add to ~/Library/Application Support/Claude/claude_desktop_config.json:',
      '',
      JSON.stringify(
        {
          mcpServers: {
            desk: { url: endpoint, transport: 'http' },
          },
        },
        null,
        2,
      ),
    ].join('\n'),
  );
}

function printCursor(endpoint: string): void {
  console.log(
    [
      '# Add to ~/.cursor/mcp.json:',
      '',
      JSON.stringify(
        {
          mcpServers: {
            desk: { url: endpoint, transport: { type: 'streamable-http' } },
          },
        },
        null,
        2,
      ),
    ].join('\n'),
  );
}

function printGeneric(endpoint: string): void {
  console.log(
    [
      `Desk's MCP endpoint: ${endpoint}`,
      '',
      'Transport: streamable HTTP (POST JSON-RPC 2.0). Capabilities: tools.',
      '',
      'Example: list available tools',
      `  curl -s ${endpoint} -H 'content-type: application/json' \\`,
      '    -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'',
    ].join('\n'),
  );
}
