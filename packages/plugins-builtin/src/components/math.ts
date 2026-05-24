import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const mathComponent = defineComponent({
  type: 'math',
  displayName: 'Math',
  schema: z.object({
    latex: z.string().min(1),
    /** Block (centered, on its own line) vs inline. */
    display: z.enum(['block', 'inline']).default('block'),
    caption: z.string().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: () => [{ path: 'expression', label: 'Expression', kind: 'text' }],
});
