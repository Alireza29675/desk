import { describe, expect, it } from 'vitest';
import { meetsMinimum } from './version';

describe('meetsMinimum', () => {
  it('treats equal versions as meeting the minimum', () => {
    expect(meetsMinimum('1.1.0', '1.1.0')).toBe(true);
  });

  it('accepts a higher patch, minor, or major', () => {
    expect(meetsMinimum('1.1.1', '1.1.0')).toBe(true);
    expect(meetsMinimum('1.2.0', '1.1.0')).toBe(true);
    expect(meetsMinimum('2.0.0', '1.1.0')).toBe(true);
  });

  it('rejects a lower patch, minor, or major', () => {
    expect(meetsMinimum('1.0.9', '1.1.0')).toBe(false);
    expect(meetsMinimum('1.0.0', '1.1.0')).toBe(false);
    expect(meetsMinimum('0.9.0', '1.1.0')).toBe(false);
  });

  it('handles the live Bun version against the engines floor', () => {
    expect(meetsMinimum('1.3.13', '1.1.0')).toBe(true);
  });

  it('tolerates a pre-release suffix', () => {
    expect(meetsMinimum('1.2.0-canary', '1.1.0')).toBe(true);
    expect(meetsMinimum('1.0.0-canary', '1.1.0')).toBe(false);
  });
});
