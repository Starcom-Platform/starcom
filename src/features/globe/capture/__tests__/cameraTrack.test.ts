/**
 * The camera track. Each interpolation decision is a defect when it is wrong
 * that a viewer would see instantly, so each gets a test that would catch it.
 */
import { describe, it, expect } from 'vitest';
import { buildCameraTrack, signedLonDelta, CameraTrackError } from '../cameraTrack';

const pan = (lng0: number, lng1: number, alt0 = 2.5, alt1 = 2.5) => buildCameraTrack([
  { atMs: 0, lat: 0, lng: lng0, altitude: alt0 },
  { atMs: 1000, lat: 0, lng: lng1, altitude: alt1 },
]);

describe('longitude takes the shorter arc', () => {
  it('computes signed deltas the short way round', () => {
    expect(signedLonDelta(0, 90)).toBe(90);
    expect(signedLonDelta(0, -90)).toBe(-90);
    expect(signedLonDelta(170, -170)).toBe(20);
    expect(signedLonDelta(-170, 170)).toBe(-20);
  });

  /**
   * The defect: plain lerp from 170°E to 170°W sweeps 340° westward across the
   * whole planet to travel 20° east. At the midpoint it would sit at 0°, the
   * far side of the Earth from both keyframes.
   */
  it('crosses the antimeridian instead of spinning the globe', () => {
    const mid = pan(170, -170).at(500);
    expect(Math.abs(mid.lng)).toBeCloseTo(180, 5);
  });

  it('keeps every pose within [-180, 180]', () => {
    const t = pan(170, -170);
    for (let ms = 0; ms <= 1000; ms += 50) {
      const { lng } = t.at(ms);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });
});

describe('altitude interpolates geometrically', () => {
  /**
   * Linear from 4 to 1 would be at 2.5 halfway — still far out, then lunging
   * at the surface. Geometric is at 2, the ratio's midpoint, which reads as a
   * steady zoom.
   */
  it('reaches the geometric mean at the midpoint', () => {
    expect(pan(0, 0, 4, 1).at(500).altitude).toBeCloseTo(2, 6);
  });
});

describe('segments ease in and out', () => {
  it('arrives at a keyframe rather than passing through it at speed', () => {
    const t = pan(0, 100);
    // Near an endpoint, smoothstep barely moves; mid-segment it moves fastest.
    const early = t.at(50).lng - t.at(0).lng;
    const middle = t.at(525).lng - t.at(475).lng;
    expect(middle).toBeGreaterThan(early * 5);
  });

  it('hits every keyframe exactly', () => {
    const t = buildCameraTrack([
      { atMs: 0, lat: 0, lng: 0, altitude: 2 },
      { atMs: 400, lat: 20, lng: 30, altitude: 1 },
      { atMs: 1000, lat: -10, lng: 60, altitude: 3 },
    ]);
    expect(t.at(400)).toEqual({ lat: 20, lng: 30, altitude: 1 });
    expect(t.at(1000).lng).toBeCloseTo(60, 10);
    expect(t.durationMs).toBe(1000);
  });

  it('clamps outside the clip rather than extrapolating past the ends', () => {
    const t = pan(0, 100);
    expect(t.at(-500)).toEqual(t.at(0));
    expect(t.at(9999)).toEqual(t.at(1000));
  });
});

describe('refusals', () => {
  const k = (atMs: number, over = {}) => ({ atMs, lat: 0, lng: 0, altitude: 2, ...over });

  it('refuses a single keyframe — that is a still, not a clip', () => {
    expect(() => buildCameraTrack([k(0)])).toThrow(CameraTrackError);
  });
  it('refuses a track that does not start at 0', () => {
    expect(() => buildCameraTrack([k(100), k(200)])).toThrow(/must be at 0ms/);
  });
  it('refuses keyframes out of order or simultaneous', () => {
    expect(() => buildCameraTrack([k(0), k(500), k(500)])).toThrow(/does not come after/);
  });
  it('refuses an altitude at or below the surface', () => {
    expect(() => buildCameraTrack([k(0), k(500, { altitude: 0 })])).toThrow(/above the surface/);
  });
  it('refuses a latitude off the planet', () => {
    expect(() => buildCameraTrack([k(0), k(500, { lat: 95 })])).toThrow(/off the planet/);
  });
});
