# @desk/types

The shared type vocabulary for Desk. The server, viewer, plugin SDK, and built-in plugins all speak these types: artifacts, components, comments, relations, history events, realtime envelopes, and plugin contracts. Validators are exported as Zod schemas so server-side and client-side validation share one source of truth.

## What lives here

| File | Concern |
| --- | --- |
| `ids.ts` | Branded ID types (`ArtifactId`, `ComponentId`, …) — cross-type mix-ups impossible at the type level. |
| `author.ts` | Who did it: the `Author` union (agent with `agentId` + `sessionId`, or human), shared by artifacts, comments, and history. |
| `artifact.ts` | The artifact envelope: provenance, contributors, current working state (`ArtifactContent`), and the `ArtifactPatch` mutation shape. |
| `component.ts` | The typed primitive inside an artifact; semantic addressing (`componentId`) is the foundation of the no-pixels rule. |
| `comment.ts` | All five anchor shapes (`element` / `region` / `text-selection` / `point` / `general`), the typed payload envelope (`text` v1, future payload kinds), and the attachment envelope (`CommentAttachment` metadata rides beside the payload; bytes live at `GET /api/attachments/:id`). |
| `relation.ts` | Typed directional edges between artifacts (`blocks`, `supports`, `is-supported-by`, `refers-to`, plus plugin-added types), and `RelationGraph` — the outgoing/incoming edge pair returned by `get_related`. |
| `history.ts` | The append-only event log shape used for time-travel. |
| `realtime.ts` | The WebSocket envelope agents and the viewer share. |
| `plugin.ts` | Plugin contracts for artifact-type, component-type, and relation-type plugins. |
| `locator.ts` | Deep-link locator grammar (`kind:value` segments, e.g. `slide:3/component:s7-code`) for addressing a place inside an artifact via the URL hash; semantic cousin of comment anchors. |

## North stars enforced here

- **Semantic anchoring.** No `Comment` anchor shape accepts raw pixel coordinates; any coordinates are relative fractions (0..1) scoped to a `componentId`, optionally refined by a semantic sub-element path or named region.
- **Extensibility.** Component data is `unknown` at the envelope layer; only the registered plugin for that component type knows its schema. Adding a new component type is a single registration call, not a fork.

## Stability

This package is the contract between server, viewer, plugins, and the MCP. Treat any change here as a versioned API change.
