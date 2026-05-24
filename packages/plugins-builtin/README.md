# @desk/plugins-builtin

The default set of plugins Desk ships with. Loading this package is what gives a fresh Desk instance the v1 vocabulary out of the box: two artifact types, fourteen component types, and four relation types.

| Group | Members |
| --- | --- |
| Artifact types | `enriched-document`, `presentation` |
| Component types | `diagram`, `chart`, `folder-structure`, `code-view`, `quote`, `image`, `youtube-embed`, `iframe`, `table`, `math`, `callout`, `checkbox`, `mindmap`, `timeline` |
| Relation types | `blocks`, `supports`, `is-supported-by`, `refers-to` |

Each plugin is a single small file under `src/components`, `src/artifacts`, or `src/relations`. They follow the patterns in `@desk/plugin-sdk` — read one and the rest are obvious. Schemas live next to the serializers so the agent-friendly format and the validation are always in sync.
