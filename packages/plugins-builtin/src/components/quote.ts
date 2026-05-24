import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const quoteComponent = defineComponent({
  type: 'quote',
  displayName: 'Quote',
  schema: z.object({
    text: z.string().min(1),
    attribution: z.string().optional(),
    sourceUrl: z.string().url().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: () => [
    { path: 'text', label: 'Quote text', kind: 'text' },
    { path: 'attribution', label: 'Attribution', kind: 'text' },
  ],
});
