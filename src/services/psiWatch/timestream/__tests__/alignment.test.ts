/**
 * The alignment lane's counts (decision D-PW, PW55, PW71): the returns stacked on their exact moments, a day each side
 * counted to 30, only the returns whose whole span lies in the record, beside the usual.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { alignCounts, getAligned, setAligned } from '../alignment';
import { readEventSet } from '../eventSets';

const DAY = 86_400_000;
const set = readEventSet({
  set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
  rows: 4, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 11, 31), zones: [],
  // 1 Mar 1992 at noon, 3 Mar, 1 Jun at noon, 2 Jun.
  t: [Date.UTC(1992, 2, 1, 12) / 1000, (Date.UTC(1992, 2, 3) - Date.UTC(1992, 2, 1, 12)) / 1000, (Date.UTC(1992, 5, 1, 12) - Date.UTC(1992, 2, 3)) / 1000, (Date.UTC(1992, 5, 2) - Date.UTC(1992, 5, 1, 12)) / 1000],
})!;

describe('the alignment', () => {
  it('stacks each return\'s events by day from exact, 30 either side', () => {
    const a = alignCounts({ returns: [Date.UTC(1992, 2, 1, 12), Date.UTC(1992, 5, 1, 12)] }, set);
    expect(a.counts).toHaveLength(61);
    expect(a.returns).toBe(2);
    // Exact day: one each; the March return's next a day and a half on (day +2), June's half a day on (day +1).
    expect(a.counts[30]).toBe(2);
    expect(a.counts[30 + 1]).toBe(1);
    expect(a.counts[30 + 2]).toBe(1);
    expect(a.counts.reduce((n, c) => n + c, 0)).toBe(4);
    expect(a.usual).toBeCloseTo((4 / 366) * 2, 9);
  });

  it('leaves out a return whose 30 days either side run past the record', () => {
    expect(alignCounts({ returns: [Date.UTC(1992, 0, 10)] }, set).returns).toBe(0);
    expect(alignCounts({ returns: null }, set).returns).toBe(0);
  });

  it('opens and closes', () => {
    setAligned(true);
    expect(getAligned()).toBe(true);
    setAligned(false);
    expect(getAligned()).toBe(false);
  });
});
