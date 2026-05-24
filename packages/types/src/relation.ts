import { z } from 'zod';
import type { ArtifactId, RelationId } from './ids';

/**
 * Built-in directional relation types. Plugins can register additional types
 * via the relation-type plugin contract. Edges are explicit (created via the
 * `add_relation` MCP tool), never inferred.
 */
export const BUILTIN_RELATION_TYPES = [
  'blocks',
  'supports',
  'is-supported-by',
  'refers-to',
] as const;

export type BuiltinRelationType = (typeof BUILTIN_RELATION_TYPES)[number];

/**
 * Relation type identifier — built-in or plugin-registered. Stored as a
 * plain string so the value space stays open to plugins; runtime
 * validation is delegated to the active plugin registry.
 */
export type RelationType = BuiltinRelationType | (string & {});

export interface Relation {
  id: RelationId;
  from: ArtifactId;
  to: ArtifactId;
  type: RelationType;
  createdAt: string;
}

export const RelationSchema: z.ZodType<Relation> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<RelationId>,
  from: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  to: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  type: z.string().min(1),
  createdAt: z.string().datetime(),
});

export interface RelationGraph {
  outgoing: Relation[];
  incoming: Relation[];
}
