import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const checkboxComponent = defineComponent({
  type: 'checkbox',
  displayName: 'Checklist',
  schema: z.object({
    title: z.string().optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          checked: z.boolean().default(false),
          note: z.string().optional(),
        }),
      )
      .min(1),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) =>
    component.data.items.map((item) => ({
      path: `items.${item.id}`,
      label: item.label,
      kind: 'text' as const,
    })),
});
