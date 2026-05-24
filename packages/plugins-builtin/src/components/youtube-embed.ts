import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const youtubeEmbedComponent = defineComponent({
  type: 'youtube-embed',
  displayName: 'YouTube embed',
  schema: z.object({
    videoId: z.string().regex(YOUTUBE_ID, 'YouTube video IDs are 11 characters of [A-Za-z0-9_-].'),
    /** Optional start offset, seconds. */
    start: z.number().int().nonnegative().optional(),
    caption: z.string().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: () => [{ path: 'video', label: 'Video', kind: 'node' }],
});
