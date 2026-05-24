# Architecture

Desk is intentionally small in volume and big in surface. One server process serves three things — an MCP endpoint, a WebSocket realtime channel, and an HTTP API for the viewer — and they all talk to one domain core, `DeskService`.

## Layers

```
                            ┌───────────────────┐
   agent ──── MCP tools ───►│                   │
                            │   DeskService     │
                            │   (domain core)   │── repositories ──► SQLite
   viewer ─── HTTP API ────►│                   │
                            │                   │── publishes events to ──► RealtimeHub
                            └───────────────────┘                              │
                                                                               │
   viewer ─── WebSocket ───────────────────────────────────────────────────────┘
```

The two transports (MCP tools, HTTP routes) are *thin*. They validate, translate to a `DeskService` call, translate the result back to the transport's shape. If a transport file gets thick, that's the signal that domain logic has leaked out of `DeskService`.

## Storage

| Table | Holds |
| --- | --- |
| `artifacts` | The working state of every artifact, JSON-encoded components blob. |
| `history_events` | Append-only commit log. Each row carries the kind, version, author, and payload (full snapshot for `created`/`edited`, the comment / relation for the other kinds). |
| `comments` | Denormalized from history so the viewer can fetch fast. |
| `relations` | Typed directional edges. |
| `artifacts_fts` | FTS5 virtual table for full-text search; reindexed on every update. |

History is the source of truth for time-travel: the working state is just an optimization. Dropping the `artifacts` table and replaying history would reconstruct the world.

## Realtime

A single WebSocket per client. The `RealtimeHub` is a fan-out registry: every mutating call on `DeskService` emits a typed `RealtimeArtifactEvent` and the hub pushes it to all subscribers of the affected artifact. The originating agent receives the echo — that's the cleanest way for it to learn the canonical post-merge state.

## Commit semantics

Hybrid. Agents call `commit(reason?)` at boundaries; if they don't, a debounce timer (default 2s) auto-commits. `update_artifact` resets the timer; `commit` cancels it.

Pollution filter (what does NOT enter history):

- Transient streaming intermediates (partial agent output before commit).
- Undo / redo churn (the user's local editing trail — never sent to the server in the first place).
- Draft states before commit (working state lives in `artifacts`, not `history_events`).
- Agent self-correction edits (the agent overwrites its own draft before the debounce fires).

What DOES enter history:

- `created`, `edited`, `commented`, `relation_added`, `relation_removed`.
- Plugins can register new history event kinds.

## Plugins

Three extension points, each with one plugin contract: artifact types, component types, relation types. The registry is the central directory; both server and viewer consume the same registry shape so renderers and validators stay in lock-step.

A plugin owns:

- The data schema (Zod) — used by the server for validation.
- The agent-friendly serializer — what the MCP returns.
- The element descriptor — addressable sub-elements for comment anchors.

The renderer (React component) is registered on the viewer side keyed by the same `type` discriminator. The server never sees the renderer; the viewer never sees the Zod schema.

## URL scheme

- `/a/<id>` — current state.
- `/a/<id>/v/<n>` — historical snapshot at version `n`.
- `/a/<id>/history` — append-only event stream as JSON.
- `/ws` — WebSocket upgrade.
- `/mcp` — JSON-RPC 2.0 endpoint for MCP tools.

`<id>` is a 14-character base32 (Crockford-style; no `I`/`L`/`O`/`U`). Short enough to drop into a URL, long enough for entropy.
