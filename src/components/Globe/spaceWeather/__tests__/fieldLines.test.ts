/**
 * The magnetosphere's field lines from T96 (space-weather-visualization.md, SW4): where they start,
 * which are closed and which open, and where they are drawn in the globe's own frame.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fieldLineSeeds, gsmToScene, RE_UNITS, traceFieldLines } from '../fieldLines';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import { subsolarDirectionWorld } from '../../../../globe-engine/globeLighting';

const AT = Date.UTC(2026, 9, 10, 12, 0) / 1000;
const QUIET = { pdyn: 2, dst: -10, byImf: 0, bzImf: -2 };

describe('the footpoints', () => {
  it('stand on a grid of magnetic latitude and local time in both hemispheres, a little above the ground, turned by the tilt', () => {
    const frame = { ...recalc(AT), psi: 0.3, sps: Math.sin(0.3), cps: Math.cos(0.3) };
    const seeds = fieldLineSeeds(frame, [70], [12, 18]);
    expect(seeds).toHaveLength(4);
    const noon = seeds.find((s) => s.hemisphere === 'north' && s.mlt === 12)!;
    const lat = (70 * Math.PI) / 180;
    // Solar-magnetic (cos 70°, 0, sin 70°) at 1.02 Re, turned toward the Sun by the tilt into GSM.
    const [xs, zs] = [Math.cos(lat) * 1.02, Math.sin(lat) * 1.02];
    expect(noon.start[0]).toBeCloseTo(xs * Math.cos(0.3) + zs * Math.sin(0.3), 12);
    expect(noon.start[2]).toBeCloseTo(zs * Math.cos(0.3) - xs * Math.sin(0.3), 12);
    expect(noon.dir).toBe(1);
    const dusk = seeds.find((s) => s.hemisphere === 'south' && s.mlt === 18)!;
    expect(dusk.start[1]).toBeGreaterThan(0.3);
    expect(dusk.dir).toBe(-1);
  });
});

describe('the lines', () => {
  const lines = traceFieldLines({ ut: AT, drivers: QUIET, latitudes: [62, 80], mlts: [0, 12] });
  const line = (lat: number, mlt: number, hemisphere = 'north') => lines.find((l) => l.lat === lat && l.mlt === mlt && l.hemisphere === hemisphere);
  const farthest = (points: number[]) => Math.max(...Array.from({ length: points.length / 3 }, (_, k) => Math.hypot(points[3 * k], points[3 * k + 1], points[3 * k + 2])));

  it('close from one hemisphere to the other at lower latitudes, ending on the ground', () => {
    const noon = line(62, 12)!;
    expect(noon.kind).toBe('closed');
    const end = noon.points.slice(-3);
    expect(Math.hypot(end[0], end[1], end[2])).toBeCloseTo(1, 3);
    expect(end[2]).toBeLessThan(0);
  });

  it('reach farther on the night side than on the day side, the wind pressing the day side in', () => {
    expect(farthest(line(62, 0)!.points)).toBeGreaterThan(farthest(line(62, 12)!.points) * 1.2);
  });

  it('open from the polar caps, into the tail, from both hemispheres; closed lines drawn once', () => {
    expect(line(80, 0)!.kind).toBe('open');
    expect(line(80, 0, 'south')!.kind).toBe('open');
    expect(line(62, 12, 'south')).toBeUndefined();
  });
});

describe('the scene\'s frame', () => {
  it('is the globe\'s: a geographic place lands where the globe draws it, 100 units an Earth radius', () => {
    const frame = recalc(AT);
    // The place at 40°N 30°E, 2 Re out, by way of GSM.
    const geo = latLngToGlobeWorld(40, 30, 2);
    const gsm = [geo.z, geo.x, geo.y]; // scene (x, y, z) is GEO (y, z, x)
    const a = frame.a;
    const inGsm = [a[0] * gsm[0] + a[1] * gsm[1] + a[2] * gsm[2], a[3] * gsm[0] + a[4] * gsm[1] + a[5] * gsm[2], a[6] * gsm[0] + a[7] * gsm[1] + a[8] * gsm[2]];
    const scene = gsmToScene(frame, inGsm);
    expect(scene[0]).toBeCloseTo(geo.x * RE_UNITS, 6);
    expect(scene[1]).toBeCloseTo(geo.y * RE_UNITS, 6);
    expect(scene[2]).toBeCloseTo(geo.z * RE_UNITS, 6);
  });

  it('points GSM\'s x at the Sun the globe is lit by, to a tenth of a degree', () => {
    const frame = recalc(AT);
    const sunward = new THREE.Vector3(...gsmToScene(frame, [1, 0, 0])).normalize();
    const lit = subsolarDirectionWorld(new Date(AT * 1000));
    expect(THREE.MathUtils.radToDeg(sunward.angleTo(lit))).toBeLessThan(0.1);
  });
});
