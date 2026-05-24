# @desk/plugin-sdk

Build new artifact types, component types, or relation types for Desk against this single contract. The server uses this registry to validate, serialize, and route everything an agent does; the viewer uses the same registry to look up renderers.

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

## Registering plugins

The server instantiates a registry, then loads every plugin into it. Built-in plugins are bundled in `@desk/plugins-builtin`; third-party plugins are loaded by path or by npm package name in the Desk config.

```ts
import { PluginRegistry } from '@desk/plugin-sdk';
import { builtinPlugins } from '@desk/plugins-builtin';

const registry = new PluginRegistry();
for (const plugin of builtinPlugins) registry.register(plugin);
```

## Invariants

- Plugin `type` values are globally unique across all three extension points.
- A component plugin owns its data schema; the rest of Desk treats `Component.data` as `unknown` until the registry validates it.
- A renderer must never need pixel coordinates — comments and interactions address sub-elements through `describeElements`.
