import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const iframeComponent = defineComponent({
  type: 'iframe',
  displayName: 'Iframe',
  schema: z.object({
    src: z.string().url(),
    /** When true, the renderer enforces a sandboxed iframe (no-same-origin off). */
    sandbox: z.boolean().default(true),
    aspectRatio: z.number().positive().optional(),
    caption: z.string().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: () => [{ path: 'iframe', label: 'Embed', kind: 'node' }],
});
