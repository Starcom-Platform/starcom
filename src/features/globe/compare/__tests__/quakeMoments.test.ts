/**
 * The quakes at two moments (D-CM, CM4): the other moment's window by the calendar, read as a paused window is, and
 * its quakes as the flags take them.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { earlierMoment, quakeKindInputs, thenQuakeWindow } from '../quakeMoments';
import type { NaturalEvent } from '../../../../hooks/useGeoEvents';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 86_400_000;

describe('the other moment', () => {
  it('is so much earlier by the calendar', () => {
    const t = Date.parse('2026-03-31T06:00:00Z');
    expect(new Date(earlierMoment(t, '1w')).toISOString()).toBe('2026-03-24T06:00:00.000Z');
    expect(new Date(earlierMoment(t, '1y')).toISOString()).toBe('2025-03-31T06:00:00.000Z');
    expect(new Date(earlierMoment(t, '10y')).toISOString()).toBe('2016-03-31T06:00:00.000Z');
    expect(new Date(earlierMoment(Date.parse('2026-05-15T00:00:00Z'), '1mo')).toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('is read from the feeds inside 30 days, from the history before', () => {
    const shown = { from: NOW - DAY, until: NOW };
    // A week before the last day begins 8 days back: past the week's feed, so the month's.
    expect(thenQuakeWindow({ earlier: '1w' }, shown, NOW)).toMatchObject({ feed: 'month', from: NOW - 8 * DAY, until: NOW - 7 * DAY, live: false });
    expect(thenQuakeWindow({ earlier: '1y' }, shown, NOW).feed).toBe('history');
    expect(thenQuakeWindow({ held: { from: NOW - 3 * DAY, until: NOW - 2 * DAY } }, shown, NOW)).toMatchObject({ feed: 'week', from: NOW - 3 * DAY });
  });
});

describe("the other moment's quakes", () => {
  it('are the quakes alone, in the bands chosen, each with its hover and its note', () => {
    const events = [
      { id: 'a', type: 'earthquake', lat: 1, lng: 2, magnitude: 5.4, depthKm: 10, timestamp: '2025-11-03T00:00:00Z' },
      { id: 'b', type: 'earthquake', lat: 1, lng: 2, magnitude: 2.1, depthKm: 10, timestamp: '2025-11-03T00:00:00Z' },
      { id: 'c', type: 'wildfire', lat: 1, lng: 2, timestamp: '2025-11-03T00:00:00Z' },
    ] as unknown as NaturalEvent[];
    const got = quakeKindInputs(events, { magnitudes: ['5', '6', '7'], depths: ['0', '33', '70', '150', '300', '500'] });
    expect(got.map((g) => g.id)).toEqual(['a']);
    expect(got[0]).toMatchObject({ hazardType: 'earthquake', magnitude: 5.4, depthKm: 10 });
    expect(got[0].tooltip).toMatch(/M5\.4/);
    expect(got[0].opens?.notes[0].id).toBe('a');
  });
});
