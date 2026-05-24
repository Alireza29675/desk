import type {
  ArtifactTypePlugin,
  ComponentTypePlugin,
  RelationTypePlugin,
} from '@desk/types';

/**
 * Helper builders. These exist so plugin authors can hold typed inference
 * on their schemas without having to spell out the kind discriminator.
 */

export function defineComponent<TData>(
  plugin: Omit<ComponentTypePlugin<TData>, 'kind'>,
): ComponentTypePlugin<TData> {
  return { kind: 'component-type', ...plugin };
}

export function defineArtifact(
  plugin: Omit<ArtifactTypePlugin, 'kind'>,
): ArtifactTypePlugin {
  return { kind: 'artifact-type', ...plugin };
}

export function defineRelation(
  plugin: Omit<RelationTypePlugin, 'kind'>,
): RelationTypePlugin {
  return { kind: 'relation-type', ...plugin };
}
