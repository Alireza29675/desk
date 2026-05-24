import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const timelineComponent = defineComponent({
  type: 'timeline',
  displayName: 'Timeline',
  schema: z.object({
    title: z.string().optional(),
    events: z
      .array(
        z.object({
          id: z.string().min(1),
          /** ISO 8601 date or datetime. */
          at: z.string().min(1),
          label: z.string().min(1),
          note: z.string().optional(),
          tone: z.enum(['neutral', 'info', 'warn', 'success', 'danger']).optional(),
        }),
      )
      .min(1),
    orientation: z.enum(['horizontal', 'vertical']).default('vertical'),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) =>
    component.data.events.map((e) => ({
      path: `events.${e.id}`,
      label: `${e.at}: ${e.label}`,
      kind: 'node' as const,
    })),
});
