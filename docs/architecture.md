# Architecture

Desk is intentionally small in volume and big in surface. One server process serves three things — an MCP endpoint, a WebSocket realtime channel, and an HTTP API for the viewer — and they all talk to one domain core, `DeskService` (`packages/server/src/core/service.ts`).

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

The two transports (MCP tools in `packages/server/src/mcp/`, HTTP routes in `packages/server/src/http/app.ts`) are *thin*. They validate, translate to a `DeskService` call, translate the result back to the transport's shape. If a transport file gets thick, that's the signal that domain logic has leaked out of `DeskService`.

## Storage

Schema and migrations live in `packages/server/src/storage/db.ts`.

| Table | Holds |
| --- | --- |
| `artifacts` | The working state of every artifact, JSON-encoded components blob. |
| `history_events` | Append-only commit log. Each row carries the kind, version, author, and payload (full snapshot for `created`/`edited`, the comment / relation for the other kinds). |
| `comments` | Denormalized from history so the viewer can fetch fast. |
| `relations` | Typed directional edges. |
| `artifacts_fts` | FTS5 virtual table for full-text search; reindexed on every update. |
| `attachments` | Comment attachment bytes (PNG blob + media type + dimensions), keyed by attachment id, indexed by comment id; metadata rides on the comment envelope, and rows cascade-delete with the comment. Served at `GET /api/attachments/<id>`. See [annotations.md](annotations.md). |

History is the source of truth for time-travel: the working state is just an optimization. Dropping the `artifacts` table and replaying history would reconstruct the world.

## Realtime

A single WebSocket per client. The `RealtimeHub` (`packages/server/src/ws/hub.ts`) is a fan-out registry: every mutating call on `DeskService` emits a typed `RealtimeArtifactEvent` and the hub pushes it to all subscribers of the affected artifact. The originating agent receives the echo — that's the cleanest way for it to learn the canonical post-merge state.

Subscriptions target one artifact id or `*` — the firehose, which receives every artifact's events. The channel bridge (`packages/channel`) rides the firehose to forward the operator's comments into a live agent session; see [annotations.md](annotations.md).

## Commit semantics

Hybrid. Agents call `commit(reason?)` at boundaries; if they don't, a debounce timer (default 2s) auto-commits. `update_artifact` resets the timer; `commit` cancels it.

Pollution filter (what does NOT enter history):

- Transient streaming intermediates (partial agent output before commit).
- Undo / redo churn (the user's local editing trail — never sent to the server in the first place).
- Draft states before commit (working state lives in `artifacts`, not `history_events`).
- Agent self-correction edits (the agent overwrites its own draft before the debounce fires).

What DOES enter history:

- `created`, `edited`, `commented`, `relation_added`, `relation_removed`.
- Those five kinds are the complete set today (a closed union in `@desk/types`); growing it is a types-level change, not a plugin hook.

## Plugins

Three extension points, each with one plugin contract: artifact types, component types, relation types. The contracts live in `packages/types/src/plugin.ts`; the server's registry (`packages/plugin-sdk/src/registry.ts`) is the central directory, and the viewer keeps its own renderer registry keyed by the same `type` discriminators — so renderers and validators stay in lock-step through the shared contracts, not a shared registry instance.

A plugin owns:

- The data schema (Zod) — used by the server for validation.
- The agent-friendly serialization of component data — a contract hook (not yet wired into the MCP read path, which returns raw components).
- The element descriptor — addressable sub-elements for comment anchors.

The renderer (React component) is registered on the viewer side keyed by the same `type` discriminator. The server never sees the renderer; the viewer never sees the Zod schema.

One deliberate exception: the `custom-react` component type, where the renderer source is itself component data — the server transpile-gates it at write time (`packages/server/src/core/custom-react.ts`, a validation hook beyond the Zod schema) and the viewer runs the compiled output in a sandboxed iframe. See [custom-components.md](custom-components.md) for the full runtime contract.

## URL scheme

Shareable viewer routes (SPA pages, served as the catch-all fallback):

- `/a/<id>` — current state.
- `/a/<id>/v/<n>` — historical snapshot at version `n`.

JSON API (all data routes mount under `/api`):

- `/api/a/<id>` — artifact with relations and comments.
- `/api/a/<id>/v/<n>` — historical snapshot at version `n`.
- `/api/a/<id>/history` — append-only event stream as JSON.
- `/api/a/<id>/baseline/<componentId>` — the authored checked-state of a checklist component, computed from history snapshots.
- `/api/a/<id>/components/<componentId>/compiled` — compiled JS for a `custom-react` component (see [custom-components.md](custom-components.md)).
- `/api/attachments/<id>` — comment attachment bytes (see [annotations.md](annotations.md)).

The full data API lives under `/api/*` — see `packages/server/src/http/app.ts` for the complete route table.

At the root:

- `/ws` — WebSocket upgrade.
- `/mcp` — JSON-RPC 2.0 endpoint for MCP tools.

`<id>` is a 14-character base32 (Crockford-style; no `I`/`L`/`O`/`U`). Short enough to drop into a URL, long enough for entropy.

## Further reading

- [mcp.md](mcp.md) — the MCP tool surface.
- [annotations.md](annotations.md) — comments, attachments, and the channel bridge.
- [custom-components.md](custom-components.md) — the `custom-react` sandbox runtime.
