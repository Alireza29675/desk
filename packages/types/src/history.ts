import { z } from 'zod';
import { AuthorSchema, type Author } from './author';
import { ArtifactContentSchema, type ArtifactContent } from './artifact';
import { CommentSchema, type Comment } from './comment';
import { RelationSchema, type Relation } from './relation';
import type { ArtifactId, HistoryEventId } from './ids';

/**
 * History events — the meaningful changes that enter the append-only log.
 * Transient streaming intermediates, undo/redo churn, draft states before
 * commit, and agent self-correction edits intentionally do NOT enter the
 * log. The commit() boundary (explicit or auto-on-idle) is what promotes
 * a working state into a history event.
 */
export type HistoryEvent =
  | HistoryEventCreated
  | HistoryEventEdited
  | HistoryEventCommented
  | HistoryEventRelationAdded
  | HistoryEventRelationRemoved;

export interface HistoryEventBase {
  id: HistoryEventId;
  artifactId: ArtifactId;
  /** Monotonic per-artifact version; bumped only on `created` and `edited`. */
  version: number;
  author: Author;
  createdAt: string;
  /** Optional human/agent-supplied reason for the commit, surfaced in the history scrubber. */
  reason?: string;
}

export interface HistoryEventCreated extends HistoryEventBase {
  kind: 'created';
  snapshot: ArtifactContent;
}

export interface HistoryEventEdited extends HistoryEventBase {
  kind: 'edited';
  snapshot: ArtifactContent;
}

export interface HistoryEventCommented extends HistoryEventBase {
  kind: 'commented';
  comment: Comment;
}

export interface HistoryEventRelationAdded extends HistoryEventBase {
  kind: 'relation_added';
  relation: Relation;
}

export interface HistoryEventRelationRemoved extends HistoryEventBase {
  kind: 'relation_removed';
  relation: Relation;
}

const HistoryEventBaseSchema = {
  id: z.string().min(1) as unknown as z.ZodType<HistoryEventId>,
  artifactId: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  version: z.number().int().nonnegative(),
  author: AuthorSchema,
  createdAt: z.string().datetime(),
  reason: z.string().optional(),
};

export const HistoryEventSchema: z.ZodType<HistoryEvent> = z.discriminatedUnion('kind', [
  z.object({ ...HistoryEventBaseSchema, kind: z.literal('created'), snapshot: ArtifactContentSchema }),
  z.object({ ...HistoryEventBaseSchema, kind: z.literal('edited'), snapshot: ArtifactContentSchema }),
  z.object({ ...HistoryEventBaseSchema, kind: z.literal('commented'), comment: CommentSchema }),
  z.object({ ...HistoryEventBaseSchema, kind: z.literal('relation_added'), relation: RelationSchema }),
  z.object({ ...HistoryEventBaseSchema, kind: z.literal('relation_removed'), relation: RelationSchema }),
]);
