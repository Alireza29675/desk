import { describe, expect, it } from 'vitest';
import { formatLocator, locatorValue, parseLocator } from './locator';

describe('parseLocator', () => {
  it('returns [] for empty / hash-only input', () => {
    expect(parseLocator('')).toEqual([]);
    expect(parseLocator('#')).toEqual([]);
    expect(parseLocator('   ')).toEqual([]);
  });

  it('parses a single segment, with or without the leading #', () => {
    expect(parseLocator('slide:3')).toEqual([{ kind: 'slide', value: '3' }]);
    expect(parseLocator('#slide:3')).toEqual([{ kind: 'slide', value: '3' }]);
  });

  it('parses multiple / -joined segments in order', () => {
    expect(parseLocator('slide:3/component:s7-code')).toEqual([
      { kind: 'slide', value: '3' },
      { kind: 'component', value: 's7-code' },
    ]);
  });

  it('lowercases the kind', () => {
    expect(parseLocator('Slide:3')).toEqual([{ kind: 'slide', value: '3' }]);
  });

  it('skips malformed segments but keeps valid ones', () => {
    expect(parseLocator('slide:3/garbage/component:x')).toEqual([
      { kind: 'slide', value: '3' },
      { kind: 'component', value: 'x' },
    ]);
  });

  it('percent-decodes values so separators survive', () => {
    expect(parseLocator('q:a%2Fb')).toEqual([{ kind: 'q', value: 'a/b' }]);
  });

  it('keeps a dotted element path intact', () => {
    expect(parseLocator('element:rows.3.cells.title')).toEqual([
      { kind: 'element', value: 'rows.3.cells.title' },
    ]);
  });
});

describe('formatLocator', () => {
  it('serializes segments, percent-encoding the value', () => {
    expect(formatLocator([{ kind: 'q', value: 'a/b' }])).toBe('q:a%2Fb');
  });

  it('drops segments with an empty kind or value', () => {
    expect(formatLocator([{ kind: 'slide', value: '' }, { kind: '', value: 'x' }, { kind: 'a', value: '1' }])).toBe('a:1');
  });
});

describe('round-trip', () => {
  for (const hash of ['slide:3', 'slide:3/component:s7-code', 'element:rows.3.cells.title', 'q:a%2Fb']) {
    it(`format(parse(${hash})) is stable`, () => {
      expect(formatLocator(parseLocator(hash))).toBe(hash);
    });
  }
});

describe('locatorValue', () => {
  const segs = parseLocator('slide:3/component:s7-code');
  it('returns the first value for a kind', () => {
    expect(locatorValue(segs, 'slide')).toBe('3');
    expect(locatorValue(segs, 'component')).toBe('s7-code');
  });
  it('returns undefined for an absent kind', () => {
    expect(locatorValue(segs, 'nope')).toBeUndefined();
  });
});
