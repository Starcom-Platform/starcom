/**
 * A quake is recent when it happened within the hour before the time the globe
 * shows: the paused moment, or now while live (decision D-E, settled 2026-09-14
 * for step 8). It was measured from the real clock, even in a replay, so a
 * replayed quake almost never got its shockwave ring.
 */
import { describe, it, expect } from 'vitest';
import { isRecentEarthquake, RECENT_QUAKE_MS } from '../ecoTime';

const MINUTE = 60_000;
const shownAt = Date.UTC(2026, 8, 12, 12);
const quakeBefore = (ms: number) => ({ type: 'earthquake', timestamp: new Date(shownAt - ms).toISOString() });

describe('isRecentEarthquake', () => {
  it('counts a quake within the hour before the time shown', () => {
    expect(RECENT_QUAKE_MS).toBe(60 * MINUTE);
    expect(isRecentEarthquake(quakeBefore(59 * MINUTE), shownAt)).toBe(true);
    expect(isRecentEarthquake(quakeBefore(0), shownAt)).toBe(true);
  });

  it('does not count a quake an hour or more before it', () => {
    expect(isRecentEarthquake(quakeBefore(60 * MINUTE), shownAt)).toBe(false);
    expect(isRecentEarthquake(quakeBefore(3 * 60 * MINUTE), shownAt)).toBe(false);
  });

  it('does not count a quake after the time shown', () => {
    expect(isRecentEarthquake(quakeBefore(-MINUTE), shownAt)).toBe(false);
  });

  it('counts only earthquakes, and only with a time it can read', () => {
    expect(isRecentEarthquake({ type: 'wildfire', timestamp: new Date(shownAt).toISOString() }, shownAt)).toBe(false);
    expect(isRecentEarthquake({ type: 'earthquake' }, shownAt)).toBe(false);
    expect(isRecentEarthquake({ type: 'earthquake', timestamp: 'not a time' }, shownAt)).toBe(false);
  });

  it('measures a replayed quake from the time shown, not from now', () => {
    const replayedAt = Date.now() - 2 * 24 * 60 * MINUTE;
    const quake = { type: 'earthquake', timestamp: new Date(replayedAt - 30 * MINUTE).toISOString() };
    expect(isRecentEarthquake(quake, replayedAt)).toBe(true);
  });
});
