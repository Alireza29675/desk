import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

const CellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const tableComponent = defineComponent({
  type: 'table',
  displayName: 'Table',
  schema: z.object({
    columns: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          align: z.enum(['left', 'center', 'right']).optional(),
          width: z.number().int().positive().optional(),
        }),
      )
      .min(1),
    rows: z.array(z.record(z.string(), CellSchema)),
    caption: z.string().optional(),
    sortable: z.boolean().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => {
    const cells: { path: string; label: string; kind: 'cell' }[] = [];
    for (const [rowIndex] of component.data.rows.entries()) {
      for (const col of component.data.columns) {
        cells.push({
          path: `rows.${rowIndex}.cells.${col.key}`,
          label: `Row ${rowIndex + 1}, ${col.label}`,
          kind: 'cell',
        });
      }
    }
    return cells;
  },
});
