# MCP guide

Desk speaks the [Model Context Protocol](https://modelcontextprotocol.io). Agents call its tools to create, edit, comment on, relate, and search artifacts. The viewer is the human's view of the same channel.

## Endpoint

```
POST http://127.0.0.1:7878/mcp
Content-Type: application/json
```

The transport is JSON-RPC 2.0 over HTTP (streamable transport). Each request is a single object; each response is a single object.

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

Mutate working state. The agent passes a patch with any subset of `{ title, components }`.

### `commit`

Promote the current working state to a history event. Cancels the pending auto-commit timer. The optional `reason` is surfaced in the history scrubber and in retrospective reads.

### `get_artifact`

Fetch an artifact, with optional `version` for time-travel. Returns the artifact plus its relation graph and active comments.

### `list_artifacts` / `search_artifacts`

`list_artifacts` is ordered by most recently updated, optionally filtered by type. `search_artifacts` runs full-text search across title + component content.

### `find_similar`

Returns artifacts whose content overlaps the target. v1 is keyword-based; the backend is hot-swappable to a vector engine without changing the tool surface.

### `comment`

Post a comment. The `anchor` field is one of:

```json
{ "kind": "element",        "componentId": "c-abc", "elementPath": "rows.3" }
{ "kind": "region",         "componentId": "c-abc", "region": { "kind": "named", "name": "diagramA" } }
{ "kind": "text-selection", "componentId": "c-abc", "elementPath": "body", "start": 12, "end": 48 }
{ "kind": "point",          "componentId": "c-abc", "elementPath": "title", "offset": { "x": 0.7, "y": 0.4 } }
{ "kind": "general" }
```

There is no pixel-coord anchor shape. By design.

### `add_relation` / `remove_relation` / `get_related`

Typed directional edges. Built-in types: `blocks`, `supports`, `is-supported-by`, `refers-to`. Plugins can register more.

### `get_history`

The append-only event log for an artifact, optionally constrained by `from` / `to` / `limit`. Each event is one of `created`, `edited`, `commented`, `relation_added`, `relation_removed`.

### `subscribe` / `unsubscribe`

In this build, the realtime channel rides a separate WebSocket; `subscribe` exists on the tool list so a future transport that multiplexes everything over one connection can land without changing the agent-side contract. Use `ws://127.0.0.1:7878/ws` directly for now (the wire format is described in `packages/types/src/realtime.ts`).

## A worked example

A minimal agent loop, in pseudocode:

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
