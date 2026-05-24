export function printHelp(): void {
  console.log(
    [
      'desk — local-first visual channel for AI agents.',
      '',
      'Usage:',
      '  desk                Start the server and open the viewer (default).',
      '  desk start          Same as `desk`, foreground.',
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
