# @desk/server

The Desk server is the single process that holds the artifact registry, runs the MCP endpoint for agents, fans out realtime events to all subscribers, and serves the viewer's HTTP API. It is local-first by design — one operator, one machine, one SQLite file.

## Architecture in one paragraph

`DeskService` is the only place that knows the domain rules (create / patch / commit / comment / relate / history-fetch / search). Both the MCP tool layer and the viewer's HTTP routes are thin adapters that translate transport-shaped input into `DeskService` calls and translate domain output back out. The realtime hub is a fan-out registry: every mutating call on `DeskService` emits a typed `RealtimeArtifactEvent` and the hub pushes it to all subscribers of the affected artifact.

```
+-------------+      +-----------------+      +---------------+
| MCP tools   | ---> |                 | ---> | SQLite store  |
+-------------+      |   DeskService   |      +---------------+
+-------------+ ---> |  (domain core)  | ---> +---------------+
| HTTP routes |      |                 |      | Realtime hub  | ---> WS clients
+-------------+      +-----------------+      +---------------+
```

## Storage

`bun:sqlite`, file lives under `~/.desk/desk.db` (or `DESK_HOME` if set). Four tables:

| Table | Holds |
| --- | --- |
| `artifacts` | The working state of every artifact, indexed by id. |
| `history_events` | The append-only commit log (created / edited / commented / relation_added / relation_removed). |
| `comments` | The live comment set, denormalized from `history_events` for fast querying. |
| `relations` | Typed directional edges between artifacts. |

## Commit semantics

Hybrid, as the spec requires: an agent can call `commit(reason?)` explicitly at meaningful boundaries; if it doesn't, `update_artifact` resets a 2-second debounce timer that auto-commits when it fires. The debouncer dedupes consecutive edits, so a 50-keystroke draft becomes one history event.

## URL scheme

- `/a/<id>` — current state of an artifact.
- `/a/<id>/v/<n>` — historical snapshot at version `n`.
- `/a/<id>/history` — full history event stream (HTTP, JSON).
- `/ws` — WebSocket entrypoint for realtime subscribers.
- `/mcp` — Streamable HTTP transport for the MCP server.

## Configuration

| Env var | Default | Effect |
| --- | --- | --- |
| `DESK_HOME` | `~/.desk` | Data directory. |
| `DESK_PORT` | `7878` | HTTP + WS port (single port). |
| `DESK_HOST` | `127.0.0.1` | Bind address — local-first; do not expose externally. |
