import { z } from 'zod';
import { ArtifactSchema, type Artifact } from './artifact';
import { CommentSchema, type Comment } from './comment';
import { RelationSchema, type Relation } from './relation';
import { HistoryEventSchema, type HistoryEvent } from './history';
import type { ArtifactId, SubscriptionId } from './ids';

/**
 * The bidirectional realtime envelope shared by agents (over MCP-bound
 * sockets) and the viewer (over the same wire format). Every message has a
 * `kind`; client→server messages start with `c.`, server→client with `s.`,
 * so a wire trace is readable at a glance.
 */
export type RealtimeClientMessage =
  | { kind: 'c.subscribe'; artifactId: ArtifactId; subscriptionId: SubscriptionId }
  | { kind: 'c.unsubscribe'; subscriptionId: SubscriptionId }
  | { kind: 'c.ping' };

export type RealtimeServerMessage =
  | { kind: 's.welcome'; serverVersion: string }
  | { kind: 's.subscribed'; subscriptionId: SubscriptionId; artifactId: ArtifactId }
  | { kind: 's.unsubscribed'; subscriptionId: SubscriptionId }
  | { kind: 's.pong' }
  | { kind: 's.error'; message: string; subscriptionId?: SubscriptionId }
  | RealtimeArtifactEvent;

/**
 * Server→client artifact events. These are pushed to every subscriber of the
 * relevant `artifactId`. The agent that originated a change still receives
 * the echo — it's the cleanest way for it to learn the canonical post-merge
 * state.
 */
export type RealtimeArtifactEvent =
  | { kind: 's.working_changed'; artifactId: ArtifactId; artifact: Artifact }
  | { kind: 's.committed'; artifactId: ArtifactId; event: HistoryEvent; artifact: Artifact }
  | { kind: 's.commented'; artifactId: ArtifactId; comment: Comment }
  | { kind: 's.relation_added'; artifactId: ArtifactId; relation: Relation }
  | { kind: 's.relation_removed'; artifactId: ArtifactId; relation: Relation };

const ArtifactIdSchema = z.string().min(1) as unknown as z.ZodType<ArtifactId>;
const SubscriptionIdSchema = z.string().min(1) as unknown as z.ZodType<SubscriptionId>;

export const RealtimeClientMessageSchema: z.ZodType<RealtimeClientMessage> = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('c.subscribe'),
      artifactId: ArtifactIdSchema,
      subscriptionId: SubscriptionIdSchema,
    }),
    z.object({ kind: z.literal('c.unsubscribe'), subscriptionId: SubscriptionIdSchema }),
    z.object({ kind: z.literal('c.ping') }),
  ],
);

export const RealtimeServerMessageSchema: z.ZodType<RealtimeServerMessage> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('s.welcome'), serverVersion: z.string() }),
    z.object({
      kind: z.literal('s.subscribed'),
      subscriptionId: SubscriptionIdSchema,
      artifactId: ArtifactIdSchema,
    }),
    z.object({ kind: z.literal('s.unsubscribed'), subscriptionId: SubscriptionIdSchema }),
    z.object({ kind: z.literal('s.pong') }),
    z.object({
      kind: z.literal('s.error'),
      message: z.string(),
      subscriptionId: SubscriptionIdSchema.optional(),
    }),
    z.object({
      kind: z.literal('s.working_changed'),
      artifactId: ArtifactIdSchema,
      artifact: ArtifactSchema,
    }),
    z.object({
      kind: z.literal('s.committed'),
      artifactId: ArtifactIdSchema,
      event: HistoryEventSchema,
      artifact: ArtifactSchema,
    }),
    z.object({
      kind: z.literal('s.commented'),
      artifactId: ArtifactIdSchema,
      comment: CommentSchema,
    }),
    z.object({
      kind: z.literal('s.relation_added'),
      artifactId: ArtifactIdSchema,
      relation: RelationSchema,
    }),
    z.object({
      kind: z.literal('s.relation_removed'),
      artifactId: ArtifactIdSchema,
      relation: RelationSchema,
    }),
  ],
);
