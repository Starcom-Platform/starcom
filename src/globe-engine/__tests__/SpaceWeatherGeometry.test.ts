import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, MeshPhongMaterial } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  AURORA_POINT_CAP,
  countVertices,
  createAuroraBlackoutMesh,
  createAuroraLines,
  BOUNDARY_CONTOURS_TYPE,
  CONTOUR_MERIDIANS,
  CONTOUR_RING_ANGLES_DEG,
  createBowShockContours,
  createGeomagneticIndexMesh,
  createMagnetopauseContours,
  logVertexCount
} from '../SpaceWeatherGeometry';
import { buildAuroralPayload } from '../../services/SpaceWeatherModeling';
import { stillMotion, releaseMotion } from '../captureClock';
import type { BoundaryDeformationProfile } from '../../services/SpaceWeatherBoundaryModel';

const makeMagnetopausePayload = () => ({ standoffRe: 10.5, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' as const });
const makeBowShockPayload = () => ({ radiusRe: 14.2, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' as const });

const makeDeformation = (confidence: number): BoundaryDeformationProfile => ({
  modelVersion: 'shue-approx-v1',
  noseRe: 10,
  flankRe: 16,
  tailRe: 40,
  alpha: 0.72,
  aberrationDeg: 4,
  dawnDuskSkew: 0.2,
  northSouthSkew: -0.1,
  confidence
});

const buildAuroraPayload = () => buildAuroralPayload({ kp: 4, timestamp: '2024-01-01T00:00:00Z' }, 'live');

const getVertexCount = (geometry: BufferGeometry) => geometry.getAttribute('position').count;

describe('SpaceWeatherGeometry render ordering and sizing', () => {
  it('draws each boundary as contour lines, its rings round the Sun-Earth axis and its lines back from the nose (SW26)', () => {
    const lines = (group: { children: unknown[] }) => group.children.find((c) => (c as LineSegments2).isLineSegments2) as LineSegments2;
    for (const group of [createMagnetopauseContours(makeMagnetopausePayload()), createBowShockContours(makeBowShockPayload())]) {
      expect(group.userData.type).toBe(BOUNDARY_CONTOURS_TYPE);
      expect(group.renderOrder).toBe(2);
      // No filled surface: nothing but the lines, and a label where a canvas can draw one.
      expect(group.children.some((c) => (c as { isMesh?: boolean }).isMesh && !(c as LineSegments2).isLineSegments2)).toBe(false);
      const segments = lines(group).geometry.getAttribute('instanceStart').count;
      expect(segments).toBe(CONTOUR_RING_ANGLES_DEG.length * 96 + CONTOUR_MERIDIANS * 48);
    }
  });

  it('sets aurora line and blackout mesh render orders to avoid z-fighting', () => {
    const aurora = buildAuroraPayload();
    const lines = createAuroraLines(aurora);
    const blackout = createAuroraBlackoutMesh(aurora);

    expect(lines.north.renderOrder).toBe(1);
    expect(lines.south.renderOrder).toBe(1);
    expect(blackout.renderOrder).toBeCloseTo(0.5);
  });

  // The shell is colored per-vertex (not via material.color, which stays
  // white so vertexColors carries the gradient) — these helpers read the
  // actual vertex color attribute at the pole (max |y|) and equator
  // (min |y|) to check both the color-tier and latitude-weighting logic.
  function vertexColorAt(geometry: BufferGeometry, pick: 'pole' | 'equator'): { r: number; g: number; b: number } {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    let bestIndex = 0;
    let bestY = Math.abs(position.getY(0));
    for (let i = 1; i < position.count; i++) {
      const absY = Math.abs(position.getY(i));
      if (pick === 'pole' ? absY > bestY : absY < bestY) {
        bestY = absY;
        bestIndex = i;
      }
    }
    return { r: color.getX(bestIndex), g: color.getY(bestIndex), b: color.getZ(bestIndex) };
  }

  it('colors the geomagnetic index shell by Kp storm category and raises opacity/renderOrder with severity', () => {
    const quiet = createGeomagneticIndexMesh({ kp: 1, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' });
    const minor = createGeomagneticIndexMesh({ kp: 5, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' });
    const severe = createGeomagneticIndexMesh({ kp: 9, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' });

    const quietMaterial = quiet.material as MeshPhongMaterial;
    const minorMaterial = minor.material as MeshPhongMaterial;
    const severeMaterial = severe.material as MeshPhongMaterial;

    // vertexColors multiplies against material.color, so it's left neutral
    // white — the gradient lives entirely in the per-vertex color attribute.
    expect(quietMaterial.color.getHexString()).toBe('ffffff');
    expect(quietMaterial.vertexColors).toBe(true);

    // quiet (kp=1) vs. minor storm (kp=5) vs. severe storm (kp=9) — all distinct hues at the pole.
    const quietPole = vertexColorAt(quiet.geometry, 'pole');
    const minorPole = vertexColorAt(minor.geometry, 'pole');
    const severePole = vertexColorAt(severe.geometry, 'pole');
    expect(quietPole).not.toEqual(minorPole);
    expect(minorPole).not.toEqual(severePole);

    // Same shell, same Kp: pole should be brighter than the equator (latitude weighting).
    const minorEquator = vertexColorAt(minor.geometry, 'equator');
    const poleBrightness = minorPole.r + minorPole.g + minorPole.b;
    const equatorBrightness = minorEquator.r + minorEquator.g + minorEquator.b;
    expect(poleBrightness).toBeGreaterThan(equatorBrightness);
    // Equator isn't fully dark — a floor keeps some global signal visible.
    expect(equatorBrightness).toBeGreaterThan(0);

    // Higher Kp should be more visually prominent, not just a different hue.
    expect(severeMaterial.opacity).toBeGreaterThan(minorMaterial.opacity);
    expect(minorMaterial.opacity).toBeGreaterThan(quietMaterial.opacity);

    expect(quiet.renderOrder).toBe(2);
    expect(getVertexCount(quiet.geometry)).toBeLessThanOrEqual(5000);
  });

  it('renders fallback-quality geomagnetic data dimmer than live at the same Kp', () => {
    const live = createGeomagneticIndexMesh({ kp: 5, lastUpdated: '2024-01-01T00:00:00Z', quality: 'live' });
    const fallback = createGeomagneticIndexMesh({ kp: 5, lastUpdated: '2024-01-01T00:00:00Z', quality: 'fallback' });

    const liveMaterial = live.material as MeshPhongMaterial;
    const fallbackMaterial = fallback.material as MeshPhongMaterial;

    expect(liveMaterial.opacity).toBeGreaterThan(fallbackMaterial.opacity);
  });

  it('counts vertices and logs via helper', () => {
    const magnetopause = createMagnetopauseContours(makeMagnetopausePayload());
    const logger = vi.fn();

    const total = logVertexCount('magnetopause', magnetopause, logger);

    expect(total).toBe(countVertices(magnetopause));
    expect(logger).toHaveBeenCalledWith('magnetopause', total);
  });

  it('downsamples oversized aurora polylines to stay under caps and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const longNorth = Array.from({ length: 2000 }, (_, i) => ({ lat: 60, lng: -180 + i * 0.18 }));
    longNorth.push(longNorth[0]);
    const longSouth = longNorth.map((p) => ({ ...p, lat: -p.lat }));
    const payload = {
      oval: { north: longNorth, south: longSouth },
      kp: 6,
      blackout: { thresholdKp: 7, gradient: { inner: 0.35, outer: 0.65 } },
      lastUpdated: '2024-01-01T00:00:00Z',
      quality: 'live' as const
    };

    const lines = createAuroraLines(payload);
    const blackout = createAuroraBlackoutMesh(payload);

    expect(lines.north.geometry.getAttribute('position').count).toBeLessThanOrEqual(AURORA_POINT_CAP);
    expect(lines.south.geometry.getAttribute('position').count).toBeLessThanOrEqual(AURORA_POINT_CAP);
    expect(blackout.geometry.getAttribute('position').count).toBeLessThanOrEqual((AURORA_POINT_CAP + 1) * 2);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

// IM23: a capture holds the aurora's pulse at rest, so the same shot makes the same picture.
describe('the aurora in a capture', () => {
  it('holds its pulse at rest while a capture stills motion, and pulses again after', () => {
    const payload = { ...buildAuroraPayload(), quality: 'live' as const, meta: { pulse: true } };
    const lines = createAuroraLines(payload as never);
    const material = lines.north.material as unknown as { opacity: number };
    const draw = () => lines.north.onBeforeRender({} as never, {} as never, {} as never, {} as never, material as never, {} as never);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(700);
    stillMotion(1_790_967_291_000);
    draw();
    expect(material.opacity).toBe(0.55);
    releaseMotion();
    draw();
    expect(material.opacity).not.toBe(0.55);
    nowSpy.mockRestore();
  });
});

describe('the boundaries\' colours and strength', () => {
  const material = (group: { children: unknown[] }) =>
    (group.children.find((c) => (c as LineSegments2).isLineSegments2) as LineSegments2).material as LineMaterial;

  it('draws the magnetopause in cyan and the bow shock in orange, as before', () => {
    expect(material(createMagnetopauseContours(makeMagnetopausePayload())).color.getHexString()).toBe('20d0e8');
    expect(material(createBowShockContours(makeBowShockPayload())).color.getHexString()).toBe('ff9f43');
  });

  it('draws live lines stronger than fallback ones', () => {
    const live = material(createMagnetopauseContours({ ...makeMagnetopausePayload(), quality: 'live' }));
    const fallback = material(createMagnetopauseContours({ ...makeMagnetopausePayload(), quality: 'fallback' }));
    expect(live.opacity).toBeGreaterThan(fallback.opacity);
  });
});
