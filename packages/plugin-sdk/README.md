# @desk/plugin-sdk

Build new artifact types, component types, or relation types for Desk against this single contract. The server uses this registry to validate, serialize, and route everything an agent does. Plugins defined here carry data contracts only, not renderers — the viewer keeps its own renderer registry (`packages/viewer/src/renderers/renderer-registry.tsx`) that maps the same `type` strings to React components.

## Writing a component type

```ts
import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const callout = defineComponent({
  type: 'callout',
  displayName: 'Callout',
  schema: z.object({
    tone: z.enum(['info', 'warn', 'danger', 'success']),
    title: z.string().optional(),
    body: z.string(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    { path: 'title', label: 'Title', kind: 'text' },
    { path: 'body', label: 'Body', kind: 'text' },
  ],
});
```

## Writing an artifact type

```ts
import { defineArtifact } from '@desk/plugin-sdk';

export const enrichedDocument = defineArtifact({
  type: 'enriched-document',
  displayName: 'Enriched document',
  emptyContent: () => ({ title: 'Untitled', components: [] }),
});
```

## Writing a relation type

```ts
import { defineRelation } from '@desk/plugin-sdk';

export const supports = defineRelation({
  type: 'supports',
  displayName: 'Supports',
  inverse: 'is-supported-by',
});
```

The artifact and relation examples above reuse built-in `type` strings — `@desk/plugins-builtin` already registers `enriched-document` and `supports`, so registering these as-is throws the duplicate-type `PluginRegistryError` described under Invariants. Pick fresh `type` strings for your own plugins.

## Registering plugins

The server instantiates a registry, then loads every plugin into it. Built-in plugins are bundled in `@desk/plugins-builtin`; extra plugins are passed programmatically via `startServer({ plugins: [...] })` from `@desk/server`, which registers them after the built-ins so duplicate types are caught. There is no config-file or npm-package plugin loading yet.

```ts
import { PluginRegistry } from '@desk/plugin-sdk';
import { builtinPlugins } from '@desk/plugins-builtin';

const registry = new PluginRegistry();
for (const plugin of builtinPlugins) registry.register(plugin);
```

## Wiring it into Desk

Defining a component plugin gets you server-side validation and serialization. To ship a new component type end to end:

1. Add the plugin under `packages/plugins-builtin/src/components/` and add it to the `builtinComponentTypes` array in that folder's `index.ts` — the array is what feeds registration; the named export alongside it is convention, not what registers the plugin. `packages/plugins-builtin/src/components/callout.ts` is the worked version of the snippet above.
2. Add a React renderer in `packages/viewer/src/renderers/` and register it in the `renderers` map in `packages/viewer/src/renderers/renderer-registry.tsx`, keyed by the same `type` string.

Skip step 2 and the component validates server-side but renders the "has no registered renderer" fallback in the viewer.

## Invariants

- Plugin `type` values must be globally unique. The registry enforces uniqueness within each extension point (duplicate registration throws `PluginRegistryError`); keeping the value space disjoint across artifact, component, and relation types is the author's responsibility.
- A component plugin owns its data schema; the rest of Desk treats `Component.data` as `unknown` until the registry validates it.
- A renderer must never need pixel coordinates — comments and interactions address sub-elements through `describeElements`.

## Development

Run `bun run typecheck` in this package after changes. The package has no local tests; registry behavior is exercised by the server's `plugins.test.ts` and `extensibility.test.ts` suites (root `bun run test`).
