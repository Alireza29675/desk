import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const imageComponent = defineComponent({
  type: 'image',
  displayName: 'Image',
  schema: z.object({
    src: z.string().url(),
    alt: z.string().min(1, 'Alt text is required for accessibility.'),
    caption: z.string().optional(),
    /** Aspect ratio hint so the renderer can reserve space and avoid CLS. */
    aspectRatio: z.number().positive().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    { path: 'image', label: 'Image', kind: 'node' },
    ...(component.data.caption ? [{ path: 'caption', label: 'Caption', kind: 'text' as const }] : []),
  ],
});
