import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

const SeriesSchema = z.object({
  name: z.string().min(1),
  /** Pairs of (category-or-x, numeric-y). */
  values: z.array(z.tuple([z.union([z.string(), z.number()]), z.number()])),
});

export const chartComponent = defineComponent({
  type: 'chart',
  displayName: 'Chart',
  schema: z.object({
    kind: z.enum(['bar', 'line', 'area', 'pie', 'scatter']),
    title: z.string().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    series: z.array(SeriesSchema).min(1),
    /** When true, the renderer stacks series (bar / area only). */
    stacked: z.boolean().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    ...(component.data.title ? [{ path: 'title', label: 'Title', kind: 'text' as const }] : []),
    ...component.data.series.map((s, i) => ({
      path: `series.${i}`,
      label: `Series: ${s.name}`,
      kind: 'group' as const,
    })),
  ],
});
