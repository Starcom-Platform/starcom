/**
 * The build line gives the UTC day the build ran, with the year (decision D-E,
 * settled 2026-09-14 for step 9). It gave the browser's local date, which in the
 * Americas is the day before for a build in the first hours of a UTC day.
 */
import { describe, it, expect } from 'vitest';
import { formatBuildLine } from '../buildIdentity';

describe('formatBuildLine: when the build ran', () => {
  it('gives the UTC day, with the year', () => {
    expect(formatBuildLine('0.1.2', { sha: 'abcdef1234567890', builtAt: '2026-07-26T02:00:00.000Z', treeDirty: false }))
      .toBe('v0.1.2 • 26 Jul 2026 • abcdef12');
  });
});
