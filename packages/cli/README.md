# @desk/cli

The user-facing entry point. One binary (`desk`) with a few focused subcommands.

| Command | What it does |
| --- | --- |
| `desk` | Start the server, open the viewer in the default browser. The default for double-click / Spotlight launches. |
| `desk start` | Same as `desk`, but stays in the foreground. |
| `desk mcp` | Print the MCP registration snippet for popular clients (Claude Desktop, Cursor, generic). Pipe into your client's config. |
| `desk where` | Print the data directory. |
| `desk doctor` | Sanity-check the install: data dir writeable, port free, plugin registry valid. |

The server it boots is `@desk/server` configured against the local SQLite file under `$DESK_HOME`. Everything stays on the loopback interface by default — Desk is single-tenant and local-first.
