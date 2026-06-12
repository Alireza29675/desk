# @desk/cli

The user-facing entry point. One binary (`desk`) with a few focused subcommands.

| Command | What it does |
| --- | --- |
| `desk` | Start the server, open the viewer in the default browser. The default when invoked with no arguments. |
| `desk start` | Alias of `desk` — identical behavior; both run in the foreground until Ctrl-C. |
| `desk mcp [claude-desktop\|cursor\|generic]` | Print MCP registration info for the chosen client. `claude-desktop` and `cursor` print a config snippet to paste into the client's config; `generic` prints the endpoint and an example `curl` call. |
| `desk where` | Print the data directory. |
| `desk doctor` | Sanity-check the install: data dir present/creatable, port free, plugin registry loads. |
| `desk help` (`--help`, `-h`) | Print usage and supported environment variables. |

The server it boots is `@desk/server` configured against the local SQLite file under `$DESK_HOME`. Everything stays on the loopback interface by default — Desk is single-tenant and local-first.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `DESK_HOME` | `~/.desk` | Data directory. |
| `DESK_PORT` | `7878` | HTTP + WS port. |
| `DESK_HOST` | `127.0.0.1` | Bind address. |
| `DESK_AUTOCOMMIT_MS` | `2000` | Auto-commit debounce in milliseconds. |

The subcommands honor subsets of these: `desk doctor` reads `DESK_HOME` and `DESK_PORT`, `desk where` reads `DESK_HOME`, and `desk mcp` reads `DESK_HOST` and `DESK_PORT` — they change which data dir is checked, which port `doctor` probes for availability, and which host/port the printed MCP snippet targets. `DESK_AUTOCOMMIT_MS` only affects the running server. Full semantics live in the Configuration table of [`packages/server/README.md`](../server/README.md).

## Development

Requires [Bun](https://bun.sh) >= 1.1. From the repo root:

```sh
bun install
bun run --filter @desk/viewer build   # one-time: the server serves the built viewer from packages/viewer/dist
bun run dev                           # filters to this package's dev script (bun run src/index.ts)
```

Until the viewer is built, the server answers `/` with a 503 pointing at that build command — so run it once before expecting a working viewer. `bun run test` and `bun run typecheck` work here and at the repo root.
