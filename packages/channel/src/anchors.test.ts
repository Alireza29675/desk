import { describe, expect, test } from 'bun:test';
import { describeAnchor, describeAnchors } from './anchors';

describe('describeAnchor', () => {
  test('general reads as "general"', () => {
    expect(describeAnchor({ kind: 'general' })).toBe('general');
  });

  test('spatial anchors read kind:componentId(.path)', () => {
    expect(describeAnchor({ kind: 'region', componentId: 'chart-1' })).toBe('region:chart-1');
    expect(
      describeAnchor({ kind: 'text-selection', componentId: 'doc-2', elementPath: 'body' }),
    ).toBe('text-selection:doc-2.body');
  });
});

describe('describeAnchors', () => {
  test('a lone document-level comment has no anchor section', () => {
    const { text, paths } = describeAnchors([{ kind: 'general' }], new Map());
    expect(text).toBe('');
    expect(paths).toEqual([]);
  });

  test('one tethered selection reads as a sentence and includes its image', () => {
    const { text, paths } = describeAnchors(
      [{ kind: 'region', componentId: 'c1' }],
      new Map([[0, '/tmp/x-a0.png']]),
    );
    expect(text).toContain('region:c1');
    expect(text).toContain('/tmp/x-a0.png');
    expect(paths).toEqual(['/tmp/x-a0.png']);
  });

  test('one tethered selection with no image still describes the anchor', () => {
    const { text, paths } = describeAnchors([{ kind: 'element', componentId: 'c1' }], new Map());
    expect(text).toContain('element:c1');
    expect(text).not.toContain('image');
    expect(paths).toEqual([]);
  });

  test('several selections list each; only the captured ones carry an image', () => {
    const images = new Map([
      [0, '/tmp/c-a0.png'],
      [2, '/tmp/c-a2.png'],
    ]);
    const { text, paths } = describeAnchors(
      [
        { kind: 'region', componentId: 'c1' },
        { kind: 'text-selection', componentId: 'c2' },
        { kind: 'point', componentId: 'c1' },
      ],
      images,
    );
    expect(text).toContain('3 selections');
    expect(text).toContain('region:c1 → image: /tmp/c-a0.png');
    expect(text).toContain('- text-selection:c2'); // no image
    expect(text).toContain('point:c1 → image: /tmp/c-a2.png');
    expect(paths).toEqual(['/tmp/c-a0.png', '/tmp/c-a2.png']);
  });
});
