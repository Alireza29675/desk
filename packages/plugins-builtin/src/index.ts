import type { DeskPlugin } from '@desk/types';
import { builtinArtifactTypes, presentationOnlyComponentTypes } from './artifacts/index';
import { builtinComponentTypes } from './components/index';
import { builtinRelationTypes } from './relations/index';

export * from './artifacts/index';
export * from './components/index';
export * from './relations/index';

/**
 * The full default plugin set. Pass this array to `PluginRegistry.register`
 * to load the v1 vocabulary into a fresh Desk instance.
 */
export const builtinPlugins: DeskPlugin[] = [
  ...builtinComponentTypes,
  ...presentationOnlyComponentTypes,
  ...builtinArtifactTypes,
  ...builtinRelationTypes,
];
