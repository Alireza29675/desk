import { describe, expect, it } from 'vitest';
import { formatArtifactDate, formatArtifactDateFull } from './artifact-dates';

// Formatting is locale-default, so assert structure (year present/absent,
// day visible) rather than an exact en-US string. Timestamps are mid-month
// midday UTC so no local timezone can shift them across a day/year boundary.
describe('formatArtifactDate', () => {
  const now = new Date('2026-06-12T12:00:00Z');

  it('omits the year for a date in the current year', () => {
    const s = formatArtifactDate('2026-06-15T12:00:00Z', now);
    expect(s).not.toContain('2026');
    expect(s).toContain('15');
  });

  it('includes the year for a date in a different year', () => {
    const s = formatArtifactDate('2025-06-15T12:00:00Z', now);
    expect(s).toContain('2025');
    expect(s).toContain('15');
  });

  it('year boundary: late December reads as last year once January arrives', () => {
    const january = new Date('2026-01-15T12:00:00Z');
    expect(formatArtifactDate('2025-12-15T12:00:00Z', january)).toContain('2025');
    expect(formatArtifactDate('2026-01-10T12:00:00Z', january)).not.toContain('2026');
  });
});

describe('formatArtifactDateFull', () => {
  it('always carries the full date including the year (tooltip form)', () => {
    const s = formatArtifactDateFull('2026-06-15T12:00:00Z');
    expect(s).toContain('2026');
    expect(s).toContain('15');
    // timeStyle: short → some hour:minute appears.
    expect(s).toMatch(/\d{1,2}:\d{2}/);
  });
});
