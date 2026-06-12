import { z } from 'zod';
import { type Author, AuthorSchema } from './author';
import type { ArtifactId, AttachmentId, CommentId, ComponentId } from './ids';

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

/**
 * Attachment metadata on the comment envelope. Sits BESIDE the payload, not
 * inside it — a comment has a body AND attachments (a region screenshot rides
 * along with the text). Bytes never live here: fetch them at
 * `GET /api/attachments/:id`.
 */
export interface CommentAttachment {
  id: AttachmentId;
  kind: 'image';
  mediaType: 'image/png';
  /** Intrinsic pixel size of the stored image. */
  width: number;
  height: number;
  /**
   * Which selection this image captured: an index into the comment's
   * `anchors`. A multi-select comment captures one image per spatial anchor,
   * so delivery can pair "the region you marked in component X" with its shot.
   */
  anchorIndex: number;
}

export const CommentAttachmentSchema: z.ZodType<CommentAttachment> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<AttachmentId>,
  kind: z.literal('image'),
  mediaType: z.literal('image/png'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  anchorIndex: z.number().int().nonnegative(),
});

/**
 * The post-time shape: the viewer sends bytes as a PNG data-URL; the server
 * decodes, validates, stores, and answers with `CommentAttachment` metadata.
 */
export interface CommentAttachmentInput {
  kind: 'image';
  dataUrl: string;
  /**
   * Index into the comment's `anchors` that this image captured. Optional
   * during the transition (a single-anchor post omits it); defaults to 0.
   */
  anchorIndex?: number;
}

export const CommentAttachmentInputSchema: z.ZodType<CommentAttachmentInput> = z.object({
  kind: z.literal('image'),
  dataUrl: z.string().regex(/^data:image\/png;base64,/, 'must be a PNG data-URL'),
  anchorIndex: z.number().int().nonnegative().optional(),
});

export interface Comment {
  id: CommentId;
  artifactId: ArtifactId;
  /**
   * Every selection this comment anchors to (mixed kinds: a region in one
   * component, a sentence in another, …). The canonical multi-anchor list,
   * always ≥1 element — a document-level comment is `[{ kind: 'general' }]`.
   *
   * Optional ONLY for the transition cycle, so existing single-anchor
   * `Comment` literals still typecheck while readers migrate. The server
   * always populates it; read it safely via `commentAnchors(c)`.
   */
  anchors?: CommentAnchor[];
  /**
   * @deprecated Transitional primary anchor (= `anchors[0]`), always present.
   * Kept as a shadow while readers migrate to `anchors`; removed once every
   * consumer reads `anchors`.
   */
  anchor: CommentAnchor;
  author: Author;
  payload: CommentPayload;
  createdAt: string;
  /** When a comment is a reply, this points at the parent comment. */
  threadParentId?: CommentId;
  /** Soft-resolved flag — kept in history; the viewer dims resolved threads. */
  resolved?: boolean;
  /** Images riding along with the comment (e.g. captured anchor regions). */
  attachments?: CommentAttachment[];
}

/**
 * The canonical anchor list for a comment, transition-safe: every server-stored
 * comment carries `anchors`, and a comment that predates the field falls back
 * to its single `anchor`. Use this everywhere instead of reading either field
 * directly, so readers never diverge during the migration.
 */
export function commentAnchors(comment: Comment): CommentAnchor[] {
  return comment.anchors ?? [comment.anchor];
}

export const CommentSchema: z.ZodType<Comment> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<CommentId>,
  artifactId: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  anchors: z.array(CommentAnchorSchema).min(1).optional(),
  anchor: CommentAnchorSchema,
  author: AuthorSchema,
  payload: CommentPayloadSchema,
  createdAt: z.string().datetime(),
  threadParentId: (z.string().min(1) as unknown as z.ZodType<CommentId>).optional(),
  resolved: z.boolean().optional(),
  attachments: z.array(CommentAttachmentSchema).optional(),
});
