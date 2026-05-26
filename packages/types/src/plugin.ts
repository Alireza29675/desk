import type { z } from 'zod';
import type { ArtifactContent } from './artifact';
import type { Component } from './component';
import type { RelationType } from './relation';

/**
 * Plugin contracts. Each plugin describes one of the three extension points:
 * artifact types (containers), component types (primitives inside artifacts),
 * or relation types (typed edges between artifacts). Renderers live in the
 * viewer and are looked up by `type`; the data schemas live here so the
 * server can validate before it ever hits a renderer.
 */

export interface ComponentTypePlugin<TData = unknown> {
  kind: 'component-type';
  /** The discriminator value placed in `Component.type`. Globally unique. */
  type: string;
  /** Human-readable label, used in the command palette and inserter UIs. */
  displayName: string;
  /** Zod schema for `Component.data` of this type. Used by the server for validation. */
  schema: z.ZodType<TData>;
  /** Builds the agent-friendly serialization of a component instance.
   *  Plain JSON, must capture every addressable sub-element so comments can
   *  anchor to them. */
  serialize: (component: Component<TData>) => unknown;
  /** Returns the addressable sub-element paths inside a component instance.
   *  Used to validate comment anchors and to populate semantic-region pickers. */
  describeElements?: (component: Component<TData>) => ElementDescriptor[];
}

export interface ElementDescriptor {
  /** Dot-separated path: e.g. `nodes.A`, `rows.3`, `bullets.2.text`. */
  path: string;
  /** Optional human-readable label for the picker UI. */
  label?: string;
  /** Optional kind hint so the picker can render contextually. */
  kind?: 'text' | 'node' | 'edge' | 'cell' | 'group';
}

export interface ArtifactTypePlugin {
  kind: 'artifact-type';
  /** The discriminator value placed in `Artifact.type`. Globally unique. */
  type: string;
  displayName: string;
  /** Component types this artifact accepts in `content.components`. If empty/undefined, accepts any. */
  allowedComponentTypes?: string[];
  /** Initial empty content used when the artifact is created with no `initial_content`. */
  emptyContent: () => ArtifactContent;
  /** Final validation hook after a patch is merged. Throw a typed error to reject. */
  validate?: (content: ArtifactContent) => void;
}

export interface RelationTypePlugin {
  kind: 'relation-type';
  type: RelationType;
  displayName: string;
  /** Optional human-readable description, surfaced in the relation picker. */
  description?: string;
  /** If true, the relation type implies a reciprocal type in the other direction.
   *  e.g. `supports` ↔ `is-supported-by`. */
  inverse?: RelationType;
}

// The component arm is `<any>` on purpose: a plugin collection is heterogeneous
// in component data type, and a typed `ComponentTypePlugin<T>` is otherwise not
// assignable to `<unknown>` (serialize param variance) — which would force every
// plugin author to cast. `<any>` makes authored plugins flow into the registry.
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin collection
export type DeskPlugin = ComponentTypePlugin<any> | ArtifactTypePlugin | RelationTypePlugin;
