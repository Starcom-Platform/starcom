/**
 * The Timestream's view of time (decision D-PW, PW37): zoomed from an hour to a century about the pointer, panned,
 * followed, and kept inside the sky catalogue's years.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  clampView, follow, fractionAt, MAX_SPAN_MS, MIN_SPAN_MS, msAt, panBy, VIEW_FROM_MS, VIEW_UNTIL_MS, viewAround, ZOOM_PRESETS, zoomAbout,
} from '../timeView';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 3, 0);

describe('the Timestream\'s view', () => {
  it('opens on a moment a third of the way in, so more of what comes is in sight', () => {
    const view = viewAround(NOW, 7 * DAY);
    expect(fractionAt(view, NOW)).toBeCloseTo(1 / 3, 9);
    expect(msAt(view, 1) - msAt(view, 0)).toBe(7 * DAY);
  });

  it('zooms about the moment under the pointer, which stays where it was', () => {
    const view = viewAround(NOW, 7 * DAY);
    const under = msAt(view, 0.8);
    const zoomed = zoomAbout(view, 1 / 1.2, 0.8);
    expect(zoomed.spanMs).toBeCloseTo((7 * DAY) / 1.2, 0);
    expect(msAt(zoomed, 0.8)).toBeCloseTo(under, 0);
  });

  it('zooms no closer than an hour and no wider than a century', () => {
    expect(zoomAbout(viewAround(NOW, MIN_SPAN_MS), 1 / 1000, 0.5).spanMs).toBe(MIN_SPAN_MS);
    expect(zoomAbout(viewAround(NOW, MAX_SPAN_MS), 1000, 0.5).spanMs).toBe(MAX_SPAN_MS);
    expect(ZOOM_PRESETS.map((p) => p.id)).toEqual(['8h', '24h', '3d', '7d', '30d', '4mo', '1y', '10y', '100y']);
  });

  it('keeps the whole view inside the sky catalogue\'s years, 1930 to 2035', () => {
    const early = clampView({ startMs: Date.UTC(1900, 0, 1), spanMs: 30 * DAY });
    expect(early.startMs).toBe(VIEW_FROM_MS);
    const late = panBy(viewAround(Date.UTC(2035, 11, 20), 30 * DAY), 2);
    expect(late.startMs + late.spanMs).toBe(VIEW_UNTIL_MS);
    const century = viewAround(NOW, MAX_SPAN_MS);
    expect(century.startMs).toBeGreaterThanOrEqual(VIEW_FROM_MS);
    expect(century.startMs + century.spanMs).toBeLessThanOrEqual(VIEW_UNTIL_MS);
  });

  it('pans by a share of its width, later to the right', () => {
    const view = viewAround(NOW, 10 * DAY);
    expect(panBy(view, 0.5).startMs - view.startMs).toBe(5 * DAY);
  });

  it('follows a moving cursor only as far as it must', () => {
    const view = viewAround(NOW, 10 * DAY, 0.5);
    expect(follow(view, NOW + DAY)).toBe(view);
    const moved = follow(view, NOW + 6 * DAY);
    expect(fractionAt(moved, NOW + 6 * DAY)).toBeCloseTo(0.95, 9);
    expect(moved.spanMs).toBe(view.spanMs);
  });
});
