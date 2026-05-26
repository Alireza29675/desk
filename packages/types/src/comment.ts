import { z } from 'zod';
import { type Author, AuthorSchema } from './author';
import type { ArtifactId, CommentId, ComponentId } from './ids';

/**
 * Comment anchors — five shapes, all semantic. There is no `{x, y}` anchor:
 * the design pillar is that anchors target meaningful units of the artifact,
 * never pixel coordinates. A region inside a diagram is described by the
 * component it lives in plus a named sub-region; a text selection is a
 * range inside a text-bearing component; etc.
 */
export type CommentAnchor =
  /** A whole typed element: a slide bullet, a diagram node, a table cell, a list item. */
  | {
      kind: 'element';
      componentId: ComponentId;
      /** Dot-separated semantic path inside the component, e.g. 'nodes.A' or 'rows.3.cells.title'. */
      elementPath?: string;
    }
  /** A 2D rectangle scoped to a component (e.g. a free-form area inside a diagram or image).
   *  Sub-region is described semantically: a named anchor inside the component, or a relative
   *  fraction (0..1) — never raw pixel coordinates. */
  | {
      kind: 'region';
      componentId: ComponentId;
      region: SemanticRegion;
    }
  /** A text range inside a text-bearing component (doc paragraph, code block, callout body). */
  | {
      kind: 'text-selection';
      componentId: ComponentId;
      elementPath?: string;
      /** Selection is described by character offsets into the resolved semantic text of the element. */
      start: number;
      end: number;
    }
  /** A pin at a specific point. Element context is required; the offset is relative (0..1). */
  | {
      kind: 'point';
      componentId: ComponentId;
      elementPath?: string;
      offset?: { x: number; y: number };
    }
  /** Artifact-level untethered comment / side-chat thread. */
  | { kind: 'general' };

/**
 * Semantic region inside a component. Either a named sub-region the component
 * plugin exposes, or relative (0..1) fractions. Pixel sizes are intentionally
 * absent — the renderer projects this into screen space at draw time.
 */
export type SemanticRegion =
  | { kind: 'named'; name: string }
  | {
      kind: 'fractional';
      x: number;
      y: number;
      width: number;
      height: number;
    };

const SemanticRegionSchema: z.ZodType<SemanticRegion> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('named'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('fractional'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
]);

const ComponentIdSchema = z.string().min(1) as unknown as z.ZodType<ComponentId>;

export const CommentAnchorSchema: z.ZodType<CommentAnchor> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('element'),
    componentId: ComponentIdSchema,
    elementPath: z.string().optional(),
  }),
  z.object({
    kind: z.literal('region'),
    componentId: ComponentIdSchema,
    region: SemanticRegionSchema,
  }),
  z.object({
    kind: z.literal('text-selection'),
    componentId: ComponentIdSchema,
    elementPath: z.string().optional(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('point'),
    componentId: ComponentIdSchema,
    elementPath: z.string().optional(),
    offset: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  }),
  z.object({ kind: z.literal('general') }),
]);

/**
 * Comment body payload — typed and extensible. v1 ships `text`. The future
 * `pen-stroke`, `sketch`, `image-overlay`, and `voice-clip` payloads land
 * here without schema changes to the rest of the comment envelope.
 */
export type CommentPayload = { kind: 'text'; text: string };

export const CommentPayloadSchema: z.ZodType<CommentPayload> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
]);

export interface Comment {
  id: CommentId;
  artifactId: ArtifactId;
  anchor: CommentAnchor;
  author: Author;
  payload: CommentPayload;
  createdAt: string;
  /** When a comment is a reply, this points at the parent comment. */
  threadParentId?: CommentId;
  /** Soft-resolved flag — kept in history; the viewer dims resolved threads. */
  resolved?: boolean;
}

export const CommentSchema: z.ZodType<Comment> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<CommentId>,
  artifactId: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  anchor: CommentAnchorSchema,
  author: AuthorSchema,
  payload: CommentPayloadSchema,
  createdAt: z.string().datetime(),
  threadParentId: (z.string().min(1) as unknown as z.ZodType<CommentId>).optional(),
  resolved: z.boolean().optional(),
});
