/**
 * Branded ID types. Two IDs that look the same at runtime are distinct at the
 * type level — passing a `CommentId` where an `ArtifactId` is expected is a
 * compile error.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ArtifactId = Brand<string, 'ArtifactId'>;
export type ComponentId = Brand<string, 'ComponentId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type RelationId = Brand<string, 'RelationId'>;
export type HistoryEventId = Brand<string, 'HistoryEventId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type SubscriptionId = Brand<string, 'SubscriptionId'>;

export const asArtifactId = (s: string) => s as ArtifactId;
export const asComponentId = (s: string) => s as ComponentId;
export const asCommentId = (s: string) => s as CommentId;
export const asAttachmentId = (s: string) => s as AttachmentId;
export const asRelationId = (s: string) => s as RelationId;
export const asHistoryEventId = (s: string) => s as HistoryEventId;
export const asSessionId = (s: string) => s as SessionId;
export const asAgentId = (s: string) => s as AgentId;
export const asSubscriptionId = (s: string) => s as SubscriptionId;
