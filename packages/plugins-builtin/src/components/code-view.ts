import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

export const codeViewComponent = defineComponent({
  type: 'code-view',
  displayName: 'Code view',
  schema: z.object({
    /** Common language identifiers Shiki understands (ts, tsx, py, rust, …). */
    language: z.string().min(1),
    code: z.string(),
    /** Optional filename shown in the chrome above the code. */
    filename: z.string().optional(),
    /** Line numbers worth visually highlighting. */
    highlightLines: z.array(z.number().int().positive()).optional(),
    /** When true, the renderer wraps long lines instead of horizontal scroll. */
    wrap: z.boolean().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => {
    const lines = component.data.code.split('\n');
    return lines.map((_, i) => ({
      path: `lines.${i + 1}`,
      label: `Line ${i + 1}`,
      kind: 'text' as const,
    }));
  },
});
