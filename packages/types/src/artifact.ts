import { z } from 'zod';
import { type Author, AuthorSchema } from './author';
import { type Component, ComponentSchema } from './component';
import type { AgentId, ArtifactId, SessionId } from './ids';

/**
 * Contributor tracking — every distinct actor who has ever touched an artifact
 * is recorded once, with the timestamp of their first touch. Order is the
 * order of first contact, oldest first.
 */
export interface Contributor {
  author: Author;
  firstTouchedAt: string;
}

export const ContributorSchema: z.ZodType<Contributor> = z.object({
  author: AuthorSchema,
  firstTouchedAt: z.string().datetime(),
});

/**
 * The provenance of an artifact: who created it, and inside which session.
 * Cross-session consumption is a core requirement (a different AI session
 * can pick up an artifact via MCP); this block is how attribution survives
 * that handoff.
 */
export interface Provenance {
  sessionId: SessionId;
  agentId: AgentId;
}

export const ProvenanceSchema: z.ZodType<Provenance> = z.object({
  sessionId: z.string().min(1) as unknown as z.ZodType<SessionId>,
  agentId: z.string().min(1) as unknown as z.ZodType<AgentId>,
});

/**
 * The current ("working") state of an artifact's content. Working state is
 * what `update_artifact` mutates; only `commit()` (explicit or auto-on-idle)
 * promotes a working state into a history event.
 */
export interface ArtifactContent {
  /** Free-form title shown in the viewer chrome. */
  title: string;
  /** Ordered list of components. For presentation artifacts, slides are an
   *  artifact-level concern represented in the components stream via slide
   *  break markers; the rendering plugin handles the projection. */
  components: Component[];
}

export const ArtifactContentSchema: z.ZodType<ArtifactContent> = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
});

export interface Artifact {
  id: ArtifactId;
  /** Plugin-registered artifact type, e.g. 'enriched-document' or 'presentation'. */
  type: string;
  content: ArtifactContent;
  provenance: Provenance;
  contributors: Contributor[];
  createdAt: string;
  updatedAt: string;
  /** Monotonically incremented committed-state counter. Bumped only on commit. */
  version: number;
}

export const ArtifactSchema: z.ZodType<Artifact> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<ArtifactId>,
  type: z.string().min(1),
  content: ArtifactContentSchema,
  provenance: ProvenanceSchema,
  contributors: z.array(ContributorSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
});

/**
 * The partial shape an agent can submit to mutate an artifact's working
 * state. All fields optional; merge is shallow at the content level.
 */
export interface ArtifactPatch {
  title?: string;
  components?: Component[];
}

export const ArtifactPatchSchema: z.ZodType<ArtifactPatch> = z.object({
  title: z.string().optional(),
  components: z.array(ComponentSchema).optional(),
});
