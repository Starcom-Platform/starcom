/**
 * How Starcom shows a count (decision D-E, settled 2026-09-14 for step 9). Counts
 * were formatted at each site, some in the viewer's own digit grouping and some in
 * en-US, so one page could group digits two ways.
 */
import { describe, it, expect } from 'vitest';
import { formatCount } from '../formatCount';

describe('formatCount', () => {
  it('groups thousands with commas', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1,000');
    expect(formatCount(1_234_567)).toBe('1,234,567');
  });

  it('shows a whole number', () => {
    expect(formatCount(1_234.6)).toBe('1,235');
    expect(formatCount(-4_200)).toBe('-4,200');
  });

  it('groups the same way whatever the browser’s locale', () => {
    const original = Intl.NumberFormat;
    try {
      // A viewer in Germany groups 1.234.567 with dots; the count must not follow.
      (Intl as { NumberFormat: unknown }).NumberFormat = function (_locale?: string, options?: Intl.NumberFormatOptions) {
        return new original(_locale ?? 'de-DE', options);
      } as unknown as typeof Intl.NumberFormat;
      expect(formatCount(1_234_567)).toBe('1,234,567');
    } finally {
      (Intl as { NumberFormat: unknown }).NumberFormat = original;
    }
  });
});
