import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineArtifact, defineComponent } from '@desk/plugin-sdk';
import type { Author, Component, DeskPlugin } from '@desk/types';
import { DeskService } from './core/service';
import { buildRegistry } from './plugins';
import { openDatabase } from './storage/db';
import { RealtimeHub } from './ws/hub';

/**
 * Proves the headline extensibility claim end-to-end: a third-party plugin
 * authored purely through the public `@desk/plugin-sdk` (defineComponent /
 * defineArtifact) registers via `buildRegistry(extra)` and the domain core
 * validates artifacts against its schema and allowed-component rules — exactly
 * the path an embedder uses via `startServer({ plugins })`.
 */

const agent = { kind: 'agent', agentId: 'a', sessionId: 's' } as unknown as Author;

const stickyNote = defineComponent<{ text: string; color: 'yellow' | 'pink' }>({
  type: 'sticky-note',
  displayName: 'Sticky Note',
  schema: z.object({ text: z.string().min(1), color: z.enum(['yellow', 'pink']) }),
  serialize: (c) => ({ id: c.id, ...c.data }),
});

const corkboard = defineArtifact({
  type: 'corkboard',
  displayName: 'Corkboard',
  allowedComponentTypes: ['sticky-note'],
  emptyContent: () => ({ title: 'Untitled corkboard', components: [] }),
});

function makeService() {
  const db = openDatabase(':memory:');
  // Cast needed because a typed ComponentTypePlugin<T> isn't assignable to
  // ComponentTypePlugin<unknown> (serialize param variance) — see #28.
  const registry = buildRegistry([stickyNote as unknown as DeskPlugin, corkboard]);
  return new DeskService({ db, registry, hub: new RealtimeHub(), autoCommitMs: 0 });
}

const note = (data: unknown): Component => ({ id: 'n1', type: 'sticky-note', data }) as unknown as Component;

describe('third-party plugin extensibility (public SDK)', () => {
  test('custom artifact + component types register and are looked up', () => {
    const svc = makeService();
    expect(svc.registry.artifactType('corkboard')).toBeDefined();
    expect(svc.registry.componentType('sticky-note')).toBeDefined();
  });

  test('the domain core accepts an artifact built from the custom types', () => {
    const svc = makeService();
    const a = svc.createArtifact({
      type: 'corkboard',
      author: agent,
      initialContent: { title: 'Board', components: [note({ text: 'hi', color: 'yellow' })] },
    });
    expect(a.type).toBe('corkboard');
    expect(svc.getArtifact(a.id).content.components).toHaveLength(1);
  });

  test('the custom component schema is enforced', () => {
    const svc = makeService();
    expect(() =>
      svc.createArtifact({
        type: 'corkboard',
        author: agent,
        initialContent: { title: 'Board', components: [note({ text: 'hi', color: 'lime' })] }, // bad enum
      }),
    ).toThrow();
  });

  test('the custom artifact’s allowedComponentTypes is enforced', () => {
    const svc = makeService();
    const callout = { id: 'c', type: 'callout', data: { tone: 'info', title: 'T', body: 'B' } } as unknown as Component;
    expect(() =>
      svc.createArtifact({ type: 'corkboard', author: agent, initialContent: { title: 'Board', components: [callout] } }),
    ).toThrow();
  });

  test('built-ins still coexist alongside the custom plugins', () => {
    const svc = makeService();
    expect(svc.registry.artifactType('presentation')).toBeDefined();
    expect(svc.registry.componentType('callout')).toBeDefined();
  });
});
