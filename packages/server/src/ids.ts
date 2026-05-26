import type {
  ArtifactId,
  CommentId,
  ComponentId,
  HistoryEventId,
  RelationId,
  SubscriptionId,
} from '@desk/types';
import { customAlphabet } from 'nanoid';

/**
 * Crockford-style base32 (no I/L/O/U). 14 chars ≈ 70 bits of entropy — plenty
 * for a local-first instance, short enough to drop into URLs without looking
 * like a serial number.
 */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const make = (len: number) => customAlphabet(ALPHABET, len);

const artifactGen = make(14);
const commentGen = make(14);
const relationGen = make(14);
const historyGen = make(16);
const subscriptionGen = make(12);
const componentGen = make(10);

export const newArtifactId = () => artifactGen() as ArtifactId;
export const newCommentId = () => commentGen() as CommentId;
export const newRelationId = () => relationGen() as RelationId;
export const newHistoryEventId = () => historyGen() as HistoryEventId;
export const newSubscriptionId = () => subscriptionGen() as SubscriptionId;
export const newComponentId = () => componentGen() as ComponentId;
