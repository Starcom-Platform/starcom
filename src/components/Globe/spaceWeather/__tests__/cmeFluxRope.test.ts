/**
 * A CME's flux rope (space-weather-visualization.md, SW28): GCS's croissant, its legs at the Sun and its apex
 * along the CME's direction, just inside the plasma's front; its field lines wound round it; laid in the
 * ecliptic, its tilt modelled; threads of light, placed and scaled with the front as the plasma is.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROPE_LINES, ROPE_POINTS, createCmeFluxRope, fluxRopeLines, ropeLightAt } from '../cmeFluxRope';
import { capFrame } from '../cmeShells';
import { sunEarthBasis } from '../heliosphereParticles';
import type { Cme } from '../../../../services/spaceWeather/donki';

const basis = sunEarthBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
const cme: Cme = { id: 'c1', leftAt: 0, speed: 1553, halfAngle: 45, lat: 12, lon: 30, type: 'O', link: '', earth: { kind: 'unmodelled' } };
const pointsOf = (line: number[]) => Array.from({ length: line.length / 3 }, (_, k) => new THREE.Vector3(line[3 * k], line[3 * k + 1], line[3 * k + 2]));

describe('the flux rope\'s field lines', () => {
  const lines = fluxRopeLines(cme);

  it('runs every line from one leg at the Sun to the other, each point a number', () => {
    expect(lines).toHaveLength(ROPE_LINES);
    for (const line of lines) {
      expect(line.every(Number.isFinite)).toBe(true);
      const points = pointsOf(line);
      expect(points[0].length()).toBeLessThan(1e-3);
      expect(points[points.length - 1].length()).toBeLessThan(1e-3);
    }
  });

  it('reaches out along the CME\'s direction to just inside its front, and spans its cone', () => {
    const [axis] = capFrame(cme);
    const all = lines.flatMap(pointsOf);
    const farthest = Math.max(...all.map((p) => p.dot(axis)));
    expect(farthest).toBeGreaterThan(0.9);
    expect(farthest).toBeLessThan(1);
    // Its legs leave the Sun at the cone's edges: the widest angle from the axis near the half-width.
    const widest = Math.max(...all.filter((p) => p.length() > 0.05).map((p) => p.angleTo(axis))) * 180 / Math.PI;
    expect(widest).toBeGreaterThan(40);
    expect(widest).toBeLessThan(75);
  });

  it('is wound round its axis: a line is on both sides of the rope\'s plane, and the lines are not one line', () => {
    const [axis, u, v] = capFrame(cme);
    const normal = new THREE.Vector3().crossVectors(axis, Math.abs(u.z) < Math.abs(v.z) ? u : v).normalize();
    const sides = pointsOf(lines[0]).map((p) => Math.sign(p.dot(normal)));
    expect(sides).toContain(1);
    expect(sides).toContain(-1);
    expect(lines[1]).not.toEqual(lines[0]);
  });

  it('lies in the ecliptic, its tilt modelled: its plane holds the CME\'s direction and the ecliptic\'s direction across it', () => {
    const flat = fluxRopeLines({ lat: 0, lon: 0, halfAngle: 40 });
    // Along the Sun-Earth line: the rope's axis runs across in y; its field lines reach above and below by its radius only.
    const all = flat.flatMap(pointsOf);
    const spanY = Math.max(...all.map((p) => Math.abs(p.y)));
    const spanZ = Math.max(...all.map((p) => Math.abs(p.z)));
    expect(spanY).toBeGreaterThan(spanZ);
  });
});

describe('the rope as drawn', () => {
  it('is a thread of light along each line, brightest at its apex and fading down its legs', () => {
    const rope = createCmeFluxRope(cme);
    expect(rope.object.name).toBe('rope-c1');
    const geometry = rope.object.geometry;
    expect(geometry.getAttribute('position').count).toBe(ROPE_LINES * ROPE_POINTS);
    const along = geometry.getAttribute('along');
    const light = Array.from({ length: ROPE_POINTS }, (_, k) => along.getX(k));
    expect(light[0]).toBeCloseTo(ropeLightAt(-1), 6);
    expect(Math.max(...light)).toBeGreaterThan(0.99);
    expect(light[0]).toBeLessThan(0.2);
    expect((rope.object.material as THREE.ShaderMaterial).blending).toBe(THREE.AdditiveBlending);
  });

  it('is placed as the plasma is, and shown only while its front is out and within its reach', () => {
    const rope = createCmeFluxRope(cme);
    const u = (rope.object.material as THREE.ShaderMaterial).uniforms;
    expect(rope.object.visible).toBe(false);
    rope.setBasis(basis);
    rope.setFront(0.6);
    expect(rope.object.visible).toBe(true);
    expect(u.scale.value).toBe(0.6);
    expect((u.xAxis.value as THREE.Vector3).toArray()).toEqual(basis.x.toArray());
    expect((u.zAxis.value as THREE.Vector3).toArray()).toEqual(basis.z.toArray());
    rope.setFront(2.5);
    expect(rope.object.visible).toBe(false);
    rope.dispose();
  });
});
