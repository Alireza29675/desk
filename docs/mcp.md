# MCP guide

Desk speaks the [Model Context Protocol](https://modelcontextprotocol.io). Agents call its tools to create, edit, comment on, relate, and search artifacts. The viewer is the human's view of the same channel.

## Endpoint

```
POST http://127.0.0.1:7878/mcp
Content-Type: application/json
```

Start the server first: `bun run --filter '@desk/cli' dev` (see the README quickstart). `7878` and `127.0.0.1` are defaults, overridable via `DESK_PORT` / `DESK_HOST`. For client wiring, `desk mcp claude-desktop` and `desk mcp cursor` print a ready-made registration snippet to paste into that client's config; `desk mcp generic` prints the endpoint plus an example `tools/list` curl call.

The transport is JSON-RPC 2.0 over a single HTTP POST endpoint. Each request is a single object; each response is a single object.

## Methods

- `initialize` — handshake; returns `serverInfo` and `capabilities`.
- `tools/list` — list every tool with its JSON schema.
- `tools/call` — invoke a tool by name with its arguments.
- `ping` — liveness probe.

## Tools

### `create_artifact`

Create a new artifact. Returns the artifact (with id, version 1, and creation timestamp).

```json
{
  "type": "enriched-document",
  "author": { "kind": "agent", "agentId": "claude", "sessionId": "s-123" },
  "initial_content": { "title": "Q4 roadmap" }
}
```

### `update_artifact`

Mutate working state. The agent passes a patch with any subset of `{ title, components }`. Working-state edits auto-commit after 2 seconds of idle (configurable via `DESK_AUTOCOMMIT_MS`, `0` disables it; each `update_artifact` resets the timer). See [architecture.md](architecture.md) for the commit model.

### `commit`

Promote the current working state to a history event. Cancels the pending auto-commit timer. The optional `reason` is surfaced in the history scrubber and in retrospective reads.

### `delete_artifact`

Permanently delete an artifact and everything attached to it — history, comments, relations. Takes `{ id }`, returns `{ ok: true, id }`. This cannot be undone, and it removes the artifact from every connected viewer live (subscribers receive an `s.deleted` event).

### `get_artifact`

Fetch an artifact, with optional `version` for time-travel. Returns the artifact plus its relation graph and all comments (resolved threads carry `resolved: true`; the viewer dims them).

### `list_artifacts` / `search_artifacts`

`list_artifacts` is ordered by most recently updated, optionally filtered by type. `search_artifacts` runs full-text search across title + component content.

### `find_similar`

Returns artifacts whose content overlaps the target. v1 is keyword-based; the backend is hot-swappable to a vector engine without changing the tool surface.

### `comment`

Post a comment. A complete call:

```json
{
  "artifact_id": "a-1",
  "anchor": { "kind": "general" },
  "body": { "kind": "text", "text": "Looks good" },
  "author": { "kind": "agent", "agentId": "claude", "sessionId": "s-123" }
}
```

Pass `thread_parent_id` to reply within an existing thread. `body` is `{ "kind": "text", "text": "..." }` — text is the only payload kind in v1.

The `anchor` field is one of:

```json
{ "kind": "element",        "componentId": "c-abc", "elementPath": "rows.3" }
{ "kind": "region",         "componentId": "c-abc", "region": { "kind": "named", "name": "diagramA" } }
{ "kind": "text-selection", "componentId": "c-abc", "elementPath": "body", "start": 12, "end": 48 }
{ "kind": "point",          "componentId": "c-abc", "elementPath": "title", "offset": { "x": 0.7, "y": 0.4 } }
{ "kind": "general" }
```

There is no pixel-coord anchor shape. By design.

**Attachments.** Comments read back via `get_artifact` (or pushed via `s.commented`) may carry an `attachments` array of image metadata — `{ id, kind: "image", mediaType: "image/png", width, height }`. The bytes live at `GET http://127.0.0.1:7878/api/attachments/:id`; fetch them there when a human attaches a screenshot. The MCP `comment` tool posts text-only bodies in this build — attachments arrive via HTTP (`POST /api/a/:id/comments`).

### `add_relation` / `remove_relation` / `get_related`

Typed directional edges. Built-in types: `blocks`, `supports`, `is-supported-by`, `refers-to`. Plugins can register more.

### `get_history`

The append-only event log for an artifact, optionally constrained by `from` / `to` / `limit`. Each event is one of `created`, `edited`, `commented`, `relation_added`, `relation_removed`.

### `subscribe` / `unsubscribe`

In this build, the realtime channel rides a separate WebSocket; `subscribe` exists on the tool list so a future transport that multiplexes everything over one connection can land without changing the agent-side contract. Use `ws://127.0.0.1:7878/ws` directly for now (the wire format is described in `packages/types/src/realtime.ts`).

## A worked example

A minimal agent loop, in pseudocode. One wire-level note: `tools/call` results arrive MCP-style as JSON text in `content[0].text` — parse that string to get the object the pseudocode treats as the return value.

```ts
const artifact = await mcp.call('create_artifact', {
  type: 'presentation',
  author: me,
});

await mcp.call('update_artifact', {
  id: artifact.id,
  author: me,
  patch: {
    title: 'Q4 product review',
    components: [
      { id: 'c-1', type: 'slide-break', data: { title: 'Q4 product review', layout: 'title' } },
      { id: 'c-2', type: 'callout', data: { tone: 'info', body: 'Three things we shipped, three we didn\'t.' } },
    ],
  },
});

await mcp.call('commit', { id: artifact.id, author: me, reason: 'Initial draft' });
```

The human sees both writes land in real time. When they comment, your subscribed WebSocket receives an `s.commented` event with the typed anchor — go read it and adjust.
