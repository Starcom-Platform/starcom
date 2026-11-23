/**
 * A tour of the reports, planned as keyframes (decision D-F, section 18, item 5).
 *
 * Opens on all of them, visits each cluster close enough to read, and pulls back.
 * Pure: it plans a camera path and moves nothing, so an agent can inspect it,
 * shorten it, or hand it straight to recordClip.
 */
import { describe, it, expect } from 'vitest';
import { planReportTour, TOUR_DEFAULTS } from '../reportTour';
import { SHARE_ALTITUDE_FLOOR } from '../shareReports';
import { buildCameraTrack } from '../cameraTrack';
import { MAX_FRAMES } from '../recordGlobeClip';

const VIEW = { fovDeg: 50, frameAspect: 1.6, cardAspect: 1.91 };
const us = [
  { id: 'racine', lat: 42.7, lng: -87.8 },
  { id: 'milwaukee', lat: 43.0, lng: -87.9 },
  { id: 'newark', lat: 39.7, lng: -75.8 },
  { id: 'wilmington', lat: 39.7, lng: -75.5 },
  { id: 'la', lat: 34.1, lng: -118.2 },
];

describe('planReportTour', () => {
  it('opens and closes on all of them, and visits each cluster between', () => {
    const plan = planReportTour(us, VIEW)!;
    const first = plan.keyframes[0];
    const last = plan.keyframes[plan.keyframes.length - 1];
    expect(first.atMs).toBe(0);
    expect(last.lat).toBeCloseTo(first.lat, 6);
    expect(last.altitude).toBeCloseTo(first.altitude, 6);
    // Racine with Milwaukee, Newark with Wilmington, and LA alone.
    expect(plan.stops).toHaveLength(3);
    expect(plan.stops.map((s) => [...s.ids].sort())).toEqual(expect.arrayContaining([
      ['milwaukee', 'racine'], ['newark', 'wilmington'], ['la'],
    ]));
  });

  it('opens further out than any stop, so the tour moves in', () => {
    const plan = planReportTour(us, VIEW)!;
    for (const stop of plan.stops) expect(plan.keyframes[0].altitude).toBeGreaterThan(stop.altitude + 0.5);
  });

  it('never goes below the framing floor', () => {
    const plan = planReportTour(us, VIEW)!;
    for (const k of plan.keyframes) expect(k.altitude).toBeGreaterThanOrEqual(SHARE_ALTITUDE_FLOOR);
  });

  it('holds still at each stop, so a viewer can read it', () => {
    const plan = planReportTour(us, VIEW, { holdMs: 2000 })!;
    for (const stop of plan.stops) {
      const at = plan.keyframes.filter((k) => Math.abs(k.lat - stop.lat) < 1e-9 && Math.abs(k.lng - stop.lng) < 1e-9);
      expect(at).toHaveLength(2);
      expect(at[1].atMs - at[0].atMs).toBe(2000);
    }
  });

  it('visits the biggest clusters when there are more than it may stop at', () => {
    const many = [
      ...us,
      ...Array.from({ length: 4 }, (_, i) => ({ id: `tx${i}`, lat: 30 + i * 0.1, lng: -97 })),
      { id: 'seattle', lat: 47.6, lng: -122.3 },
    ];
    const plan = planReportTour(many, VIEW, { maxStops: 2 })!;
    expect(plan.stops).toHaveLength(2);
    expect(plan.stops.some((s) => s.ids.length === 4)).toBe(true);
    expect(plan.skipped).toBe(many.length - plan.stops.reduce((n, s) => n + s.ids.length, 0));
  });

  it('plans a path recordClip will accept, within its frame limit at the default rate', () => {
    const plan = planReportTour(us, VIEW, { maxStops: TOUR_DEFAULTS.maxStops })!;
    const track = buildCameraTrack(plan.keyframes);
    expect(Math.round((track.durationMs / 1000) * 30) + 1).toBeLessThanOrEqual(MAX_FRAMES);
    expect(plan.durationMs).toBe(track.durationMs);
  });

  it('refuses what one overview cannot show, rather than touring the far side', () => {
    expect(planReportTour([{ id: 'a', lat: 0, lng: 0 }, { id: 'b', lat: 0, lng: 180 }], VIEW)).toBeNull();
    expect(planReportTour([], VIEW)).toBeNull();
  });

  it('keeps every keyframe strictly after the one before', () => {
    const plan = planReportTour(us, VIEW)!;
    for (let i = 1; i < plan.keyframes.length; i++) {
      expect(plan.keyframes[i].atMs).toBeGreaterThan(plan.keyframes[i - 1].atMs);
    }
  });
});
