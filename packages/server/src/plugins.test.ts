import { describe, expect, test } from 'bun:test';
import { PluginRegistry } from '@desk/plugin-sdk';
import { builtinPlugins } from '@desk/plugins-builtin';
import type { ArtifactContent, Component } from '@desk/types';
import { buildRegistry } from './plugins';

const callout = (data: unknown): Component =>
  ({ id: 'c', type: 'callout', data }) as unknown as Component;
const content = (components: Component[]): ArtifactContent => ({ title: 'T', components });

describe('PluginRegistry (built-in vocabulary)', () => {
  test('buildRegistry loads the v1 artifact, component, and relation types', () => {
    const r = buildRegistry();
    expect(r.artifactType('enriched-document')).toBeDefined();
    expect(r.artifactType('presentation')).toBeDefined();
    expect(r.componentType('callout')).toBeDefined();
    expect(r.relationType('refers-to')).toBeDefined();
    expect(r.artifactType('nope')).toBeUndefined();
  });

  test('registering a duplicate type throws', () => {
    const r = buildRegistry();
    // Re-registering any built-in collides.
    expect(() => {
      for (const p of builtinPlugins) r.register(p);
    }).toThrow();
  });

  test('validateContent accepts a well-formed component', () => {
    const r = buildRegistry();
    expect(() =>
      r.validateContent(
        'enriched-document',
        content([callout({ tone: 'info', title: 'A', body: 'B' })]),
      ),
    ).not.toThrow();
  });

  test('validateContent rejects a component with invalid data', () => {
    const r = buildRegistry();
    expect(() => r.validateContent('enriched-document', content([callout({})]))).toThrow();
  });

  test('validateContent enforces allowedComponentTypes (no slide-break in a document)', () => {
    const r = buildRegistry();
    const slideBreak = {
      id: 's',
      type: 'slide-break',
      data: { title: 'X', layout: 'title' },
    } as unknown as Component;
    expect(() => r.validateContent('enriched-document', content([slideBreak]))).toThrow();
  });

  test('validateContent rejects an unknown artifact type', () => {
    const r = buildRegistry();
    expect(() => r.validateContent('mystery', content([]))).toThrow();
  });

  test('a fresh registry has no built-ins until populated', () => {
    const r = new PluginRegistry();
    expect(r.artifactType('enriched-document')).toBeUndefined();
  });
});
