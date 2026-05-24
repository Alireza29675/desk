# @desk/types

The shared type vocabulary for Desk. Every other package in the monorepo speaks these types: artifacts, components, comments, relations, history events, realtime envelopes, and plugin manifests. Validators are exported as Zod schemas so server-side and client-side validation share one source of truth.

## What lives here

| File | Concern |
| --- | --- |
| `ids.ts` | Branded ID types (`ArtifactId`, `ComponentId`, …) — collisions impossible at the type level. |
| `artifact.ts` | The artifact envelope: provenance, contributors, current state, references to outgoing/incoming relations. |
| `component.ts` | The typed primitive inside an artifact; semantic addressing (`componentId`) is the foundation of the no-pixels rule. |
| `comment.ts` | All five anchor shapes (`element` / `region` / `text-selection` / `point` / `general`) and the typed payload envelope (`text` v1, future visual payloads). |
| `relation.ts` | Typed directional edges between artifacts (`blocks`, `supports`, `is-supported-by`, `refers-to`, plus plugin-added types). |
| `history.ts` | The append-only event log shape used for time-travel. |
| `realtime.ts` | The WebSocket envelope agents and the viewer share. |
| `plugin.ts` | Manifest contracts for artifact-type, component-type, and relation-type plugins. |

## North stars enforced here

- **Semantic anchoring.** No `Comment` anchor shape accepts raw `{x, y}`; coordinates always come with a `componentId` and a semantic sub-element path.
- **Extensibility.** Component data is `unknown` at the envelope layer; only the registered plugin for that component type knows its schema. Adding a new component type is a single registration call, not a fork.

## Stability

This package is the contract between server, viewer, plugins, and the MCP. Treat any change here as a versioned API change.
