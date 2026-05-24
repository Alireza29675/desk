import { defineArtifact } from '@desk/plugin-sdk';
import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';
import { BUILTIN_COMPONENT_TYPE_NAMES } from '../components/index';

/**
 * Slide breaks are a presentation-only component. Inserting one in the
 * component stream tells the presentation renderer to start a new slide.
 * Optional `title` / `notes` carry per-slide metadata. Keeping slides as
 * a stream of typed components (rather than nested arrays) lets every
 * existing component type drop into a presentation without translation.
 */
export const slideBreakComponent = defineComponent({
  type: 'slide-break',
  displayName: 'Slide break',
  schema: z.object({
    title: z.string().optional(),
    speakerNotes: z.string().optional(),
    /** Optional layout hint for the slide that follows (until the next break). */
    layout: z.enum(['title', 'content', 'two-column', 'full-bleed']).optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    ...(component.data.title ? [{ path: 'title', label: 'Slide title', kind: 'text' as const }] : []),
    ...(component.data.speakerNotes
      ? [{ path: 'speakerNotes', label: 'Speaker notes', kind: 'text' as const }]
      : []),
  ],
});

export const presentationArtifact = defineArtifact({
  type: 'presentation',
  displayName: 'Presentation',
  allowedComponentTypes: [...BUILTIN_COMPONENT_TYPE_NAMES, 'slide-break'],
  emptyContent: () => ({
    title: 'Untitled presentation',
    components: [
      {
        id: 'slide-1' as never,
        type: 'slide-break',
        data: { title: 'Slide 1', layout: 'title' },
      },
    ],
  }),
});
