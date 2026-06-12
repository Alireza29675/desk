# @desk/server

The Desk server is the single process that holds the artifact registry, runs the MCP endpoint for agents, fans out realtime events to all subscribers, and serves the viewer's HTTP API. It also serves the built viewer SPA itself (from `packages/viewer/dist`) as the catch-all route, so `/a/<id>` is a shareable browser URL; if the viewer isn't built yet, `/` answers 503 with the build command (`bun run --filter @desk/viewer build`). It is local-first by design — one operator, one machine, one SQLite file.

## Architecture in one paragraph

`DeskService` is the only place that knows the domain rules — the artifact lifecycle and everything around it. Both the MCP tool layer and the viewer's HTTP routes are thin adapters that translate transport-shaped input into `DeskService` calls and translate domain output back out. The realtime hub is a fan-out registry: every mutating call on `DeskService` emits a typed `RealtimeArtifactEvent` and the hub pushes it to all subscribers of the affected artifact.

```
+-------------+      +-----------------+      +---------------+
| MCP tools   | ---> |                 | ---> | SQLite store  |
+-------------+      |   DeskService   |      +---------------+
+-------------+ ---> |  (domain core)  | ---> +---------------+
| HTTP routes |      |                 |      | Realtime hub  | ---> WS clients
+-------------+      +-----------------+      +---------------+
```

## Storage

`bun:sqlite`, file lives under `~/.desk/desk.db` (or `DESK_HOME` if set). Five tables, plus an FTS5 virtual table:

| Table | Holds |
| --- | --- |
| `artifacts` | The working state of every artifact, indexed by id. |
| `history_events` | The append-only commit log (created / edited / commented / relation_added / relation_removed). |
| `comments` | The live comment set, denormalized from `history_events` for fast querying. |
| `relations` | Typed directional edges between artifacts. |
| `attachments` | PNG bytes for comment attachments; metadata rides on the comment envelope; CASCADE-deleted with the comment. |
| `artifacts_fts` | FTS5 virtual table — full-text index over artifact title and body, backing `GET /api/artifacts/search`. |

## Commit semantics

Hybrid: an agent can call `commit(reason?)` explicitly at meaningful boundaries; if it doesn't, `update_artifact` resets a debounce timer (2 seconds by default — the `DESK_AUTOCOMMIT_MS` setting) that auto-commits when it fires. The debouncer dedupes consecutive edits, so a 50-keystroke draft becomes one history event.

## URL scheme

Three surfaces share the port — plain HTTP, the WebSocket upgrade, and the MCP endpoint — so clients only need one origin. `/ws` and `/mcp` are intercepted in `Bun.serve` before the request reaches the HTTP app; inside the HTTP app, JSON data routes live under `/api/*` (plus the root `/health` probe), and everything else falls through to the viewer SPA, so `/a/<id>` is a shareable browser URL rather than an API endpoint.

- `/api/a/<id>` — current state of an artifact, plus its relations and comments.
- `/api/a/<id>/v/<n>` — historical snapshot at version `n`.
- `/api/a/<id>/history` — full history event stream.
- `/api/a/<id>/baseline/<componentId>` — authored (reset-target) checked-state of a checklist component.
- `/api/a/<id>/components/<componentId>/compiled` — compiled JS for a `custom-react` component (`Cache-Control: no-store`).
- `/api/attachments/<id>` — comment attachment bytes, served with immutable caching. Comments may carry image attachments: metadata rides on the comment envelope, bytes live in SQLite.
- `/a/<id>` — the viewer, opened on that artifact (SPA fallback).
- `/ws` — WebSocket entrypoint for realtime subscribers.
- `/mcp` — JSON-RPC 2.0 endpoint for MCP tools (POST only; hand-rolled to match the streamable HTTP transport's `tools/*` shape).
- `/health` — liveness probe (kept off `/api` so external checks stay simple).

## Custom components

`custom-react` component source is validated at the write boundary: create/patch runs the TSX through `Bun.Transpiler`, and invalid code is rejected with the transpiler's own error so the authoring agent gets an immediate fix-it signal. The viewer's sandbox harness fetches the compiled JS from `/api/a/<id>/components/<componentId>/compiled`. See [docs/custom-components.md](../../docs/custom-components.md) for the full runtime picture.

## Configuration

| Env var | Default | Effect |
| --- | --- | --- |
| `DESK_HOME` | `~/.desk` | Data directory. |
| `DESK_PORT` | `7878` | HTTP + WS port (single port). |
| `DESK_HOST` | `127.0.0.1` | Bind address — local-first; do not expose externally. |
| `DESK_AUTOCOMMIT_MS` | `2000` | Auto-commit debounce in milliseconds; `0` disables auto-commit. |
| `DESK_VIEWER_DIST` | `packages/viewer/dist` (resolved relative to the server source) | Where the built viewer SPA is served from. |

## Develop

The server is Bun-only — it uses `bun:sqlite` and `Bun.serve`, so Node cannot run it. Run `bun install` at the repo root, then from `packages/server`:

- `bun run dev` — watch-mode server on `http://127.0.0.1:7878`.
- `bun test` — run the test suite.
- `bun run typecheck` — `tsc --noEmit`.

The package also exposes a `desk-server` bin (`src/bin.ts`). For the full-stack flow (CLI + server + viewer), see the repo-root [CONTRIBUTING.md](../../CONTRIBUTING.md).
