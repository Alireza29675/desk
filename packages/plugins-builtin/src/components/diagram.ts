import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

/**
 * `diagram` — a structural diagram described in a text-based DSL. D2 is the
 * default engine (best agent-generated layout); Graphviz is the fallback for
 * cases D2 can't express well. Mermaid is intentionally not offered: the
 * spec lists it as out. Excalidraw lacks auto-layout and is therefore not
 * an agent-default — it'd land as a separate `sketch` component if needed.
 */
export const diagramComponent = defineComponent({
  type: 'diagram',
  displayName: 'Diagram',
  schema: z.object({
    engine: z.enum(['d2', 'graphviz']).default('d2'),
    /** Source in the chosen engine's text DSL. */
    source: z.string().min(1),
    /** Optional semantic IDs the agent wants the viewer to surface as anchors.
     *  These map to nodes/edges in the source DSL. The renderer uses them so
     *  comments on the diagram address `nodes.A` rather than pixel positions. */
    namedNodes: z.array(z.string().min(1)).optional(),
    namedEdges: z.array(z.string().min(1)).optional(),
    caption: z.string().optional(),
  }),
  serialize: (component) => ({
    id: component.id,
    engine: component.data.engine,
    source: component.data.source,
    namedNodes: component.data.namedNodes,
    namedEdges: component.data.namedEdges,
    caption: component.data.caption,
  }),
  describeElements: (component) => [
    ...(component.data.namedNodes ?? []).map((name) => ({
      path: `nodes.${name}`,
      label: `Node ${name}`,
      kind: 'node' as const,
    })),
    ...(component.data.namedEdges ?? []).map((name) => ({
      path: `edges.${name}`,
      label: `Edge ${name}`,
      kind: 'edge' as const,
    })),
    ...(component.data.caption ? [{ path: 'caption', label: 'Caption', kind: 'text' as const }] : []),
  ],
});
