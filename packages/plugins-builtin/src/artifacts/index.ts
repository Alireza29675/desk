import type { ArtifactTypePlugin, ComponentTypePlugin } from '@desk/types';
import { enrichedDocumentArtifact } from './enriched-document';
import { presentationArtifact, slideBreakComponent } from './presentation';

export { enrichedDocumentArtifact, presentationArtifact, slideBreakComponent };

export const builtinArtifactTypes: ArtifactTypePlugin[] = [
  enrichedDocumentArtifact,
  presentationArtifact,
];

/** Presentation-only components that the artifact module owns. */
// biome-ignore lint/suspicious/noExplicitAny: a plugin collection is heterogeneous in component data type
export const presentationOnlyComponentTypes: ComponentTypePlugin<any>[] = [slideBreakComponent];
