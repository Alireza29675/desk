<div align="center">

# Desk

**A visual communication channel between AI agents and the human at the keyboard.**

Agents draft, draw, present. The human watches it form in real time, comments on the bullet that's wrong, points at the diagram node that needs a label. Comments fly back to the agent the moment they land.

[Quickstart](#quickstart) · [Why](#why) · [How it works](#how-it-works) · [MCP surface](#mcp-surface) · [Plugins](#plugins) · [Roadmap](#roadmap)

</div>

---

> [!WARNING]
> **🚧 WIP experiment.** Desk is an early, fast-moving experiment built largely autonomously with Claude Code. Expect rough edges, breaking changes, and missing pieces. Not production-ready — explore it, don't depend on it yet.

---

## Why

Most AI tools talk to you through a chat box. That's fine for sentences. It is the wrong surface for anything visual — a slide deck, a system diagram, a chart, a tree of options. By the time an agent describes a diagram in prose, the diagram itself would have been clearer.

Desk inverts the surface. Agents create *typed visual artifacts* (enriched documents, presentations, diagrams, charts, …) and stream them into a viewer that the human is already looking at. The human's reaction — a comment on slide 3's third bullet, a rectangle drawn around the muddled section of a chart — flows back to the agent on the same channel.

Two design principles guide every decision:

1. **Semantic anchoring, not coordinates.** Comments target *a bullet on slide 3*, *a node in the diagram*, *cell B4 in a table* — never pixels. The structure under the visual rendering is the addressable surface; rendering is the projection.
2. **HCI is the headline investment.** Trade-offs against UX quality lose. Sub-100ms feedback, keyboard-first power, Linear/Raycast/Figma-grade craft. Performance and clarity beat feature count.

## Quickstart

Desk runs locally. One binary, one port, one SQLite file.

```bash
bun install
bun run --filter '@desk/cli' dev
```

This starts the server on `http://127.0.0.1:7878` and opens the viewer. Then wire your agent's MCP client to `http://127.0.0.1:7878/mcp`:

```bash
desk mcp claude-desktop   # prints a snippet to paste into Claude Desktop's config
desk mcp cursor           # ditto for Cursor
desk mcp generic          # transport details + a curl example
```

Your agent now has fifteen tools: `create_artifact`, `update_artifact`, `commit`, `delete_artifact`, `get_artifact`, `list_artifacts`, `search_artifacts`, `find_similar`, `get_related`, `add_relation`, `remove_relation`, `comment`, `get_history`, `subscribe`, `unsubscribe`.

## How it works

```
            ┌───────────────────────────────────────────────────────────────────┐
            │                              Desk                                 │
            │                                                                   │
   agent ─► │  MCP tools  ─►  DeskService ─►  SQLite   (artifacts, history,     │
            │                  (domain core)            comments, relations)    │
            │                       │                                           │
   human ─► │  HTTP routes ─►       │                                           │
            │                       ▼                                           │
            │                 Realtime hub  ─►  WebSocket fan-out  ─►  viewer   │
            └───────────────────────────────────────────────────────────────────┘
```

- **Domain core.** A single `DeskService` is the only code that knows the business rules: create, patch, commit, comment, relate, history-fetch, search. Both the MCP tool layer and the viewer's HTTP API are thin adapters over it.
- **Storage.** `bun:sqlite` in `$DESK_HOME/desk.db`. Four tables: `artifacts`, `history_events`, `comments`, `relations`, plus an FTS5 virtual table for search.
- **Commit semantics.** Hybrid: agents call `commit(reason?)` at meaningful boundaries; if they don't, a 2-second debounce timer auto-commits. Transient drafts, undo churn, and pre-commit edits stay out of history.
- **Time travel.** Every commit appends a snapshot. Open `/a/<id>/v/<n>` to see the artifact as it was at version `n`.
- **Realtime.** A single WebSocket per client. Subscribe to an artifact id (or `*` for the firehose); receive `s.working_changed`, `s.committed`, `s.commented`, `s.comment_resolved`, `s.relation_added`, `s.relation_removed`, `s.deleted` events.

## What lives in an artifact

Artifacts are typed containers of components.

**v1 artifact types** — `enriched-document`, `presentation`.

**v1 component vocabulary (14)** — `diagram` (D2 default, Graphviz fallback), `chart`, `folder-structure`, `code-view`, `quote`, `image`, `youtube-embed`, `iframe`, `table`, `math` (KaTeX), `callout`, `checkbox`, `mindmap`, `timeline`. Every component declares its addressable sub-elements (nodes, rows, lines, …); that's the anchor surface comments target.

**v1 relation types** — `blocks`, `supports`, `is-supported-by`, `refers-to`. Edges are explicit, never inferred.

Adding new types — artifact, component, or relation — is one file in a plugin package. The registry validates, serializes, and routes; the viewer renders.

## MCP surface

| Tool | Purpose |
| --- | --- |
| `create_artifact(type, author, initial_content?)` | Create a new artifact; returns id, url, current state. |
| `update_artifact(id, patch, author)` | Apply a patch to the working state. |
| `commit(id, author, reason?)` | Promote working state to a history event. |
| `delete_artifact(id)` | Permanently delete an artifact and all attached comments, history, and relations. |
| `get_artifact(id, version?)` | Fetch current state, or a past committed snapshot. |
| `list_artifacts(filter?)` | List artifacts; filter by type. |
| `search_artifacts(query)` | Full-text + structural search. |
| `find_similar(id)` | Content-similarity (v1: keyword overlap; vector path open). |
| `get_related(id)` | Outgoing + incoming typed edges. |
| `add_relation(from_id, type, to_id)` | Add a typed directional edge. |
| `remove_relation(from_id, type, to_id)` | Remove an edge. |
| `comment(artifact_id, anchor, body, author)` | Post a comment with a semantic anchor. |
| `get_history(id, range?)` | Append-only event log. |
| `subscribe(artifact_id)` | Open a realtime stream. |
| `unsubscribe(subscription_id)` | Close a realtime stream. |

Comment anchors are semantic, never pixels: `element` (a typed sub-element), `region` (a named or fractional region inside a component), `text-selection` (a text range), `point` (a pin with element context), `general` (artifact-level).

## Plugins

Three extension points, one contract per shape. Adding a component type:

```ts
import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const checklist = defineComponent({
  type: 'checklist',
  displayName: 'Checklist',
  schema: z.object({
    items: z.array(z.object({ id: z.string(), label: z.string(), checked: z.boolean() })),
  }),
  serialize: (c) => ({ id: c.id, ...c.data }),
  describeElements: (c) => c.data.items.map((i) => ({ path: `items.${i.id}`, label: i.label, kind: 'text' })),
});
```

Register it on the server and add a renderer on the viewer side — both look up by `type`. See [`packages/plugin-sdk/README.md`](packages/plugin-sdk/README.md) and [`packages/plugins-builtin/`](packages/plugins-builtin/) for the patterns.

**Extension boundary (today):** plugins register through the **embedding API** — `startServer({ plugins: [...] })` — and the domain core validates against their schemas (covered by `extensibility.test.ts`). Two pieces aren't wired yet: loading plugins from a config file for the standalone server, and registering viewer renderers at runtime (the viewer's renderer map is build-time, so a third-party component validates server-side but falls back to a placeholder until its renderer is added to the viewer build). Tracked for post-v1.

## Design

Linear + Raycast + Figma DNA. Restrained, modern, monochrome with a single coral accent (`#FF5A4D`). Light default; dark themed correctly from day 1 (dual-token system). Inter body + a serif accent for headings — the Linear detail that makes the page feel composed rather than generic.

Performance is part of the design: sub-100ms feedback on every common interaction, 60fps on multi-component artifacts, ⌘K opens the command palette in one frame. Animations signal state (focus, position, change) — never decoration.

## Repo layout

```
packages/
  types/             # the shared type vocabulary
  plugin-sdk/        # plugin contracts + runtime registry
  plugins-builtin/   # the v1 vocabulary (2 artifact types, 14 components, 4 relations)
  server/            # SQLite + MCP + WebSocket + HTTP, single port
  viewer/            # the React app
  cli/               # `desk` binary
```

Each package has its own README documenting the part it owns.

## Roadmap

| Cut | What lands |
| --- | --- |
| **v0.1** (this) | Local server, MCP (incl. delete), viewer, 14 components, 2 artifact types, comments (5 anchor shapes) with threads + resolve/reopen, append-only history with time-travel **and an in-viewer scrubber**, search, realtime channel, **live D2 + Graphviz SVG diagrams**, a **relations panel**, **PDF export**, theme persistence, responsive drawers, keyboard-focus + reduced-motion a11y, per-component error boundaries. |
| v0.2 | Visual comments (pen / sketch / image overlay) — payload schema is already typed-extensible. Inline component editing in the viewer. Third-party plugin loading from config + runtime viewer renderers. |
| v0.3 | Live presentation mode for human audiences. Multi-agent CRDT/OT beyond last-write-wins. Vector-backed similarity. |

## License

MIT © Alireza Sheikholmolouki

## Acknowledgements

Built on the shoulders of D2, Graphviz, Shiki, KaTeX, Hono, Bun, React, and the Model Context Protocol. Thanks.
