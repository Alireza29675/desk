# @desk/plugins-builtin

The default set of plugins Desk ships with. Loading this package is what gives a fresh Desk instance the v1 vocabulary out of the box: two artifact types, fifteen component types, and four relation types.

| Group | Members |
| --- | --- |
| Artifact types | `enriched-document`, `presentation` |
| Component types | `diagram`, `chart`, `folder-structure`, `code-view`, `quote`, `image`, `youtube-embed`, `iframe`, `table`, `math`, `callout`, `checkbox`, `mindmap`, `timeline`, `custom-react` |
| Relation types | `blocks`, `supports`, `is-supported-by`, `refers-to` |

`custom-react` is the sandboxed runtime for AI-authored React components — the server transpiles the TSX at write time and the viewer runs it in an opaque-origin iframe; the full contract is in the repo's `docs/custom-components.md`. The `presentation` artifact also owns a presentation-only `slide-break` component type, defined alongside it in `src/artifacts/presentation.ts` and registered via `presentationOnlyComponentTypes` rather than the main component list.

Component plugins are each a single small file under `src/components`; artifact plugins live under `src/artifacts` (the presentation file also defines its `slide-break` component); the four relation types are defined together in `src/relations/index.ts`. They follow the patterns in `@desk/plugin-sdk` — read one and the rest are obvious. Schemas live next to the serializers so the agent-friendly format and the validation are always in sync.

## Adding a component type

1. Copy an existing file in `src/components/` and adapt the `defineComponent` call.
2. Export it from `src/components/index.ts` and append it to `builtinComponentTypes` there. The `presentation` artifact's `allowedComponentTypes` picks it up automatically via `BUILTIN_COMPONENT_TYPE_NAMES`.
3. Add a renderer in `packages/viewer/src/renderers/<type>.tsx` and register it in `renderer-registry.tsx` — without this the viewer cannot render the new type.
4. Run `bun run typecheck` and `bun run test` in this package and in `packages/viewer`.

The server loads the whole set via `builtinPlugins` in `packages/server/src/plugins.ts`; no extra wiring is needed there.
