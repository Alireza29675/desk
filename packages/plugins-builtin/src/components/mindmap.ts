import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

type MindmapNode = {
  id: string;
  label: string;
  note?: string;
  children?: MindmapNode[];
};

const MindmapNodeSchema: z.ZodType<MindmapNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    note: z.string().optional(),
    children: z.array(MindmapNodeSchema).optional(),
  }),
);

function walk(node: MindmapNode, acc: string[]): void {
  acc.push(node.id);
  for (const child of node.children ?? []) walk(child, acc);
}

export const mindmapComponent = defineComponent({
  type: 'mindmap',
  displayName: 'Mindmap',
  schema: z.object({
    root: MindmapNodeSchema,
    /** Optional layout preference; the renderer respects it as a hint. */
    layout: z.enum(['radial', 'tree-right', 'tree-down']).optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => {
    const ids: string[] = [];
    walk(component.data.root, ids);
    return ids.map((id) => ({ path: `nodes.${id}`, label: id, kind: 'node' as const }));
  },
});
