import { describe, it, expect, vi } from 'vitest';
import { applyZoomFactor, directionToGlobeLatLng, setGlobePointOfView } from '../globeCameraMath';
import { globeCameraTelemetry } from '../../services/globe/GlobeCameraTelemetry';

// Independent reimplementation of three-globe's own polar2Cartesian (copied from
// node_modules/three-globe/dist/three-globe.mjs, not exported by the package so it
// can't be imported directly), used only here to round-trip verify
// directionToGlobeLatLng against the real library's own camera-placement convention —
// not a duplicate of any production code path.
function polar2Cartesian(lat: number, lng: number, relAltitude = 0) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = 100 * (1 + relAltitude);
  const phiSin = Math.sin(phi);
  return {
    x: r * phiSin * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * phiSin * Math.sin(theta),
  };
}

describe('applyZoomFactor', () => {
  it('zooms in (factor < 1) by decreasing altitude', () => {
    expect(applyZoomFactor(2.5, 0.8, 0.5, 4)).toBeCloseTo(2.0);
  });

  it('zooms out (factor > 1) by increasing altitude', () => {
    expect(applyZoomFactor(2.0, 1.25, 0.5, 4)).toBeCloseTo(2.5);
  });

  it('clamps to the minimum altitude', () => {
    expect(applyZoomFactor(0.6, 0.5, 0.5, 4)).toBe(0.5);
  });

  it('clamps to the maximum altitude', () => {
    expect(applyZoomFactor(3.8, 1.5, 0.5, 4)).toBe(4);
  });
});

describe('directionToGlobeLatLng', () => {
  it('round-trips through three-globe\'s own polar2Cartesian convention', () => {
    // For a variety of directions, converting to {lat,lng} and back through the
    // library's real camera-placement math should reproduce a point along the same
    // ray (same normalized direction), confirming this is genuinely the inverse of
    // react-globe.gl's own convention and not just some other plausible-looking one.
    const directions = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 1, y: 1, z: 1 },
      { x: -0.5, y: 0.3, z: -0.8 },
    ];

    for (const dir of directions) {
      const { lat, lng } = directionToGlobeLatLng(dir);
      const roundTripped = polar2Cartesian(lat, lng);
      const inputLen = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      const outputLen = Math.sqrt(roundTripped.x ** 2 + roundTripped.y ** 2 + roundTripped.z ** 2);

      expect(roundTripped.x / outputLen).toBeCloseTo(dir.x / inputLen, 5);
      expect(roundTripped.y / outputLen).toBeCloseTo(dir.y / inputLen, 5);
      expect(roundTripped.z / outputLen).toBeCloseTo(dir.z / inputLen, 5);
    }
  });

  it('placing the camera opposite a direction lets it look toward that direction', () => {
    // If a body sits in the +X direction, the camera needs to be positioned in the
    // -X direction (so it looks back through the globe center toward +X) to see it —
    // this is the actual usage pattern for auto-framing the camera toward the Sun.
    const bodyDirection = { x: 1, y: 0, z: 0 };
    const cameraLatLng = directionToGlobeLatLng({ x: -bodyDirection.x, y: -bodyDirection.y, z: -bodyDirection.z });
    const cameraPos = polar2Cartesian(cameraLatLng.lat, cameraLatLng.lng);

    // Camera position should point opposite the body direction...
    expect(cameraPos.x).toBeLessThan(0);
    // ...and the view direction (origin - cameraPos, since the camera always looks at
    // the globe center) should point toward the body.
    const viewDirX = 0 - cameraPos.x;
    expect(viewDirX).toBeGreaterThan(0);
  });

  it('returns {lat: 0, lng: 0} for a degenerate (zero-length) direction', () => {
    expect(directionToGlobeLatLng({ x: 0, y: 0, z: 0 })).toEqual({ lat: 0, lng: 0 });
  });
});

describe('setGlobePointOfView', () => {
  it('calls the real pointOfView() setter with the given pov and ms', () => {
    const pointOfView = vi.fn();
    const pov = { lat: 12, lng: 34, altitude: 1.5 };

    setGlobePointOfView({ pointOfView }, pov, 300);

    expect(pointOfView).toHaveBeenCalledWith(pov, 300);
  });

  it('publishes the real target orientation to globeCameraTelemetry — the fix for onZoom never firing on a programmatic pointOfView() call (confirmed directly: globe.gl\'s own setter moves the camera without touching OrbitControls or its change event)', () => {
    const pov = { lat: -20, lng: 100, altitude: 2.2 };

    setGlobePointOfView({ pointOfView: vi.fn() }, pov, 0);

    expect(globeCameraTelemetry.getCurrent()).toEqual(pov);
  });
});
