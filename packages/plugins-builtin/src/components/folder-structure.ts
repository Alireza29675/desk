import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

/**
 * Trees are arbitrary-depth, so the schema is recursive. Each node has a
 * `name`, an optional `kind` (file / dir; renderer chooses an icon), and
 * optional `children`. The `path` exposed in `describeElements` is the
 * dotted dotted-name path through the tree from the root.
 */
type FolderNode = {
  name: string;
  kind?: 'file' | 'dir';
  note?: string;
  children?: FolderNode[];
};

const FolderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    kind: z.enum(['file', 'dir']).optional(),
    note: z.string().optional(),
    children: z.array(FolderNodeSchema).optional(),
  }),
);

function flatten(prefix: string, nodes: FolderNode[] | undefined, acc: string[]): void {
  for (const node of nodes ?? []) {
    const path = prefix ? `${prefix}.${node.name}` : node.name;
    acc.push(path);
    flatten(path, node.children, acc);
  }
}

export const folderStructureComponent = defineComponent({
  type: 'folder-structure',
  displayName: 'Folder structure',
  schema: z.object({
    root: z.string().default('/'),
    nodes: z.array(FolderNodeSchema),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => {
    const paths: string[] = [];
    flatten('', component.data.nodes, paths);
    return paths.map((p) => ({ path: `nodes.${p}`, label: p, kind: 'node' as const }));
  },
});
