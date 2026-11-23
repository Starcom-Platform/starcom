/**
 * A CME's front sweeping across the Earth's orbit (space-weather-visualization.md, SW30): the arc of the orbit
 * inside its cone, lit as its front nears 1 AU, brightest as it crosses, gone once it has passed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCmeOrbitSweep, orbitArcInCone, sweepLight } from '../cmeOrbitSweep';
import { capFrame } from '../cmeShells';
import type { Cme } from '../../../../services/spaceWeather/donki';

const cme: Cme = { id: 'c1', leftAt: 0, speed: 900, halfAngle: 40, lat: 10, lon: 25, type: 'C', link: '', earth: { kind: 'unmodelled' } };
const pointsOf = (line: number[]) => Array.from({ length: line.length / 3 }, (_, k) => new THREE.Vector3(line[3 * k], line[3 * k + 1], line[3 * k + 2]));

describe('the arc of the Earth\'s orbit inside a CME\'s cone', () => {
  it('lies on the orbit, 1 AU round the Sun in the ecliptic, inside the cone and out to its edges', () => {
    const [axis] = capFrame(cme);
    const points = pointsOf(orbitArcInCone(cme)!);
    for (const p of points) {
      expect(p.length()).toBeCloseTo(1, 9);
      expect(p.z).toBe(0);
      expect(p.angleTo(axis) * 180 / Math.PI).toBeLessThanOrEqual(40 + 1e-6);
    }
    expect(points[0].angleTo(axis) * 180 / Math.PI).toBeCloseTo(40, 6);
    expect(points[points.length - 1].angleTo(axis) * 180 / Math.PI).toBeCloseTo(40, 6);
  });

  it('runs through the Earth when the Earth lies in the cone, and is not there when the cone misses the ecliptic', () => {
    const points = pointsOf(orbitArcInCone(cme)!);
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(0);
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(0);
    expect(orbitArcInCone({ lat: 70, lon: 0, halfAngle: 30 })).toBeNull();
    expect(createCmeOrbitSweep({ ...cme, lat: 70, halfAngle: 30 })).toBeNull();
  });

  it('is lit as the front nears 1 AU, brightest as it crosses, gone once the CME has passed', () => {
    expect(sweepLight(0.5)).toBe(0);
    expect(sweepLight(0.9)).toBeGreaterThan(sweepLight(0.85));
    expect(sweepLight(1)).toBeCloseTo(1, 9);
    expect(sweepLight(1.15)).toBeLessThan(1);
    expect(sweepLight(1.4)).toBe(0);
    const sweep = createCmeOrbitSweep(cme)!;
    expect(sweep.object.name).toBe('sweep-c1');
    sweep.setFront(0.4);
    expect(sweep.object.visible).toBe(false);
    sweep.setFront(1);
    expect(sweep.object.visible).toBe(true);
    expect((sweep.object.material as THREE.ShaderMaterial).uniforms.scale.value).toBe(1);
    sweep.dispose();
  });
});
