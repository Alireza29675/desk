import { defineRelation } from '@desk/plugin-sdk';
import type { RelationTypePlugin } from '@desk/types';

export const blocksRelation = defineRelation({
  type: 'blocks',
  displayName: 'Blocks',
  description: 'The source artifact prevents progress on the target until resolved.',
});

export const supportsRelation = defineRelation({
  type: 'supports',
  displayName: 'Supports',
  description: 'The source artifact provides evidence or backing for the target.',
  inverse: 'is-supported-by',
});

export const isSupportedByRelation = defineRelation({
  type: 'is-supported-by',
  displayName: 'Is supported by',
  description: 'The source artifact rests on the target as evidence or backing.',
  inverse: 'supports',
});

export const refersToRelation = defineRelation({
  type: 'refers-to',
  displayName: 'Refers to',
  description: 'The source artifact mentions or links to the target.',
});

export const builtinRelationTypes: RelationTypePlugin[] = [
  blocksRelation,
  supportsRelation,
  isSupportedByRelation,
  refersToRelation,
];
