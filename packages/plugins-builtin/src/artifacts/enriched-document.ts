import { defineArtifact } from '@desk/plugin-sdk';
import { BUILTIN_COMPONENT_TYPE_NAMES } from '../components/index';

/**
 * Enriched document — a long-form styled artifact. Components flow in order;
 * the renderer lays them out vertically with the design-system typography
 * scale. There is no concept of "pages" or "slides"; for those, use the
 * presentation artifact type instead.
 */
export const enrichedDocumentArtifact = defineArtifact({
  type: 'enriched-document',
  displayName: 'Enriched document',
  allowedComponentTypes: BUILTIN_COMPONENT_TYPE_NAMES.filter((t) => t !== 'slide-break'),
  emptyContent: () => ({ title: 'Untitled document', components: [] }),
});
