import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const calloutComponent = defineComponent({
  type: 'callout',
  displayName: 'Callout',
  schema: z.object({
    tone: z.enum(['info', 'warn', 'danger', 'success']),
    title: z.string().optional(),
    body: z.string().min(1),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    ...(component.data.title ? [{ path: 'title', label: 'Title', kind: 'text' as const }] : []),
    { path: 'body', label: 'Body', kind: 'text' as const },
  ],
});
