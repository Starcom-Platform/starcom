/**
 * The time a GDELT layer shows (D-E; D-DP, DP15). One shared time: in live mode a layer filters
 * nothing by time, so Diplomacy and Conflict Zones show their snapshot's whole day; paused, the
 * shared window decides. Their own "Time Range" sliders, a second cursor counting hours back from
 * the snapshot, are gone.
 */
import { describe, expect, it } from 'vitest';
import { gdeltSpanFor, snapshotCoverage, withinSpan } from '../gdeltTimeSpan';
import type { RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';

const HOUR = 3_600_000;
const AS_OF = Date.UTC(2026, 9, 13, 9, 0);
const FROM = AS_OF - 24 * HOUR + 15 * 60_000;
const snapshot = { from: FROM, asOf: AS_OF };
const at = (dateAdded: string) => ({ dateAdded }) as RealGdeltEvent;

describe('the span a GDELT layer shows', () => {
  it('is the snapshot\'s whole day in live mode', () => {
    expect(gdeltSpanFor(null, snapshot)).toEqual({ start: FROM, end: AS_OF });
  });

  it('is a day back from the snapshot\'s time where its start was not kept', () => {
    expect(gdeltSpanFor(null, { from: null, asOf: AS_OF })).toEqual({ start: AS_OF - 24 * HOUR, end: AS_OF });
  });

  it('is the shared window when paused', () => {
    const window = { start: AS_OF - 3 * HOUR, end: AS_OF - HOUR };
    expect(gdeltSpanFor(window, snapshot)).toEqual(window);
  });

  it('is nothing before the snapshot is read', () => {
    expect(gdeltSpanFor(null, { from: null, asOf: null })).toBeNull();
  });
});

describe('an event in a span', () => {
  const span = { start: Date.UTC(2026, 9, 13, 6), end: Date.UTC(2026, 9, 13, 8) };
  it('is one GDELT added within it, ends included', () => {
    expect(withinSpan(at('20261013060000'), span)).toBe(true);
    expect(withinSpan(at('20261013080000'), span)).toBe(true);
    expect(withinSpan(at('20261013081500'), span)).toBe(false);
    expect(withinSpan(at('20261013054500'), span)).toBe(false);
  });

  it('is never one whose time cannot be read', () => {
    expect(withinSpan(at('not a time'), span)).toBe(false);
  });
});

describe('how much of a paused window the snapshot covers', () => {
  it('says nothing in live mode', () => {
    expect(snapshotCoverage(null, snapshot)).toBeNull();
  });

  it('is all of it, part of it, or none of it', () => {
    expect(snapshotCoverage({ start: AS_OF - 3 * HOUR, end: AS_OF - HOUR }, snapshot)).toBe('all');
    expect(snapshotCoverage({ start: AS_OF - 48 * HOUR, end: AS_OF - HOUR }, snapshot)).toBe('part');
    expect(snapshotCoverage({ start: AS_OF - HOUR, end: AS_OF + 3 * HOUR }, snapshot)).toBe('part');
    expect(snapshotCoverage({ start: AS_OF - 72 * HOUR, end: AS_OF - 48 * HOUR }, snapshot)).toBe('none');
  });
});
