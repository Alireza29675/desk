import type { ComponentId } from '@desk/types';
import { describe, expect, it } from 'vitest';
import { draftAfterToggle } from './checkbox-draft';

const cid = 'comp-1' as ComponentId;

describe('draftAfterToggle — the composer seed a toggle produces', () => {
  it('first toggle drafts an item-anchored "Checked: <label>"', () => {
    const d = draftAfterToggle(null, {
      componentId: cid,
      itemId: 'i1',
      label: 'Ship it',
      checked: true,
    });
    expect(d.text).toBe('Checked: Ship it');
    expect(d.anchor).toEqual({ kind: 'element', componentId: cid, elementPath: 'items.i1' });
  });

  it('unchecking drafts "Unchecked: <label>"', () => {
    const d = draftAfterToggle(null, {
      componentId: cid,
      itemId: 'i1',
      label: 'Ship it',
      checked: false,
    });
    expect(d.text).toBe('Unchecked: Ship it');
  });

  it('coalesces consecutive toggles on the same checklist and widens the anchor to the component', () => {
    const first = draftAfterToggle(null, {
      componentId: cid,
      itemId: 'i1',
      label: 'A',
      checked: true,
    });
    const second = draftAfterToggle(
      { text: first.text, componentId: cid },
      { componentId: cid, itemId: 'i2', label: 'B', checked: false },
    );
    expect(second.text).toBe('Checked: A · Unchecked: B');
    // Widened: no single item path once two items are involved.
    expect(second.anchor).toEqual({ kind: 'element', componentId: cid });
  });

  it('a toggle on a DIFFERENT checklist starts a fresh item-anchored draft (last-write-wins)', () => {
    const other = 'comp-2' as ComponentId;
    const d = draftAfterToggle(
      { text: 'Checked: A', componentId: cid },
      { componentId: other, itemId: 'x', label: 'X', checked: true },
    );
    expect(d.text).toBe('Checked: X');
    expect(d.anchor).toEqual({ kind: 'element', componentId: other, elementPath: 'items.x' });
  });
});
