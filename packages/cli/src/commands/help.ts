export function printHelp(): void {
  console.log(
    [
      'desk — local-first visual channel for AI agents.',
      '',
      'Usage:',
      '  desk                Ensure the server is running and open the viewer (default).',
      '  desk start [--open] Ensure the background server is running. -f/--foreground runs it inline (dev).',
      '  desk serve          Run the server in the foreground (no browser). The raw service process.',
      '  desk stop           Stop the background server.',
      '  desk status         Report whether the server is running, its url, version, and pid.',
      '  desk restart [--open] Stop then start the background server.',
      '  desk mcp [client]   Print MCP registration snippet. client: claude-desktop | cursor | generic',
      '  desk where          Print the Desk data directory.',
      '  desk doctor         Diagnose the install.',
      '  desk help           Show this message.',
      '',
      'Environment:',
      '  DESK_HOME           Data directory (default: ~/.desk)',
      '  DESK_PORT           HTTP + WS port (default: 7878)',
      '  DESK_HOST           Bind address (default: 127.0.0.1)',
      '  DESK_AUTOCOMMIT_MS  Auto-commit-on-idle window (default: 2000)',
      '',
    ].join('\n'),
  );
}
