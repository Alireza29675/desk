import { defineComponent } from '@desk/plugin-sdk';
import { z } from 'zod';

/**
 * An AI-authored React component: charts, timers, calculators — anything.
 *
 * `code` is TSX defining a function named `Component`. It runs INSIDE a
 * sandboxed iframe (opaque origin, no network), receives `theme` plus
 * everything in `props` as its React props, and must be self-contained —
 * React is provided; imports are not available. The server transpiles the
 * code at write time (a syntax error rejects the create/patch with the
 * transpiler's message) and serves compiled JS to the viewer's harness.
 * See docs/custom-components.md for the full runtime contract.
 */
export const customReactComponent = defineComponent({
  type: 'custom-react',
  displayName: 'Custom component',
  schema: z.object({
    /** TSX source. Must define `function Component(props) { … }`. */
    code: z.string().min(1).max(64 * 1024),
    /** Extra props handed to the component alongside `theme`. */
    props: z.record(z.unknown()).optional(),
    /** Render height in px (the frame is width-fluid). */
    height: z.number().int().min(80).max(1200).optional(),
    caption: z.string().optional(),
  }),
  serialize: (component) => ({ id: component.id, ...component.data }),
  describeElements: (component) => [
    {
      path: 'component',
      label: component.data.caption ?? 'custom component',
      kind: 'text' as const,
    },
  ],
});
