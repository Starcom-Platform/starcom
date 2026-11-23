/**
 * The CMEs' shells (space-weather-visualization.md, SW8, SW23): each a cone-model cap at its front, round
 * its direction from the drawn Sun, placed as the solar system is; coloured by its measured speed from
 * the tokens; outlined when the Earth lies in its cone.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLASMA_PARTICLES, capPointAu, cmeColour, createCmePlasma, drawnSunEarthPoint, plasmaParticles, plasmaPointAu, shellStrength } from '../cmeShells';
import { sunEarthBasis } from '../heliosphereParticles';
import { DATA_SCALES } from '../../../../styles/tokens';
import { DRAWN_UNITS_PER_AU } from '../../../../solar-system/bodyPlacement';
import type { Cme } from '../../../../services/spaceWeather/donki';

const basis = sunEarthBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
const near = (a: number[], b: number[], digits = 9) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], digits));
const cme: Cme = { id: 'c1', leftAt: 0, speed: 1553, halfAngle: 45, lat: 12, lon: 9, type: 'O', link: '', earth: { kind: 'unmodelled' } };

describe('the cap', () => {
  it('has its middle at the front along the CME\'s direction, and its rim at its half-width from it', () => {
    near(capPointAu({ lat: 0, lon: 90, halfAngle: 30 }, 0, 0, 0.6), [0, 0.6, 0]);
    for (const phi of [0, 1, 2, 3, 4, 5]) {
      const p = capPointAu({ lat: 12, lon: 9, halfAngle: 45 }, 1, phi, 0.8);
      const axis = capPointAu({ lat: 12, lon: 9, halfAngle: 45 }, 0, 0, 1);
      expect(Math.hypot(...p)).toBeCloseTo(0.8, 9);
      expect(Math.acos((p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]) / 0.8) * 180 / Math.PI).toBeCloseTo(45, 6);
    }
  });

  it('is placed as the solar system is: the Earth on the globe, the rest at its one scale (C32)', () => {
    expect(drawnSunEarthPoint([1, 0, 0], basis).length()).toBeLessThan(1e-6);
    const sunward = drawnSunEarthPoint([0.5, 0, 0], basis);
    expect(sunward.clone().normalize().x).toBeCloseTo(1, 9);
    expect(sunward.length()).toBeCloseTo(0.5 * DRAWN_UNITS_PER_AU, 3);
    // North of the ecliptic stays north.
    expect(drawnSunEarthPoint([1, 0, 0.2], basis).dot(basis.z)).toBeGreaterThan(0);
  });
});

describe('a shell\'s colour', () => {
  const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  it('runs the tokens\' speeds, pale when slow, hot when fast, held at the ends', () => {
    const stops = DATA_SCALES.cmeSpeedKmS;
    expect(cmeColour(stops[0][0])).toEqual(hex(stops[0][1]));
    expect(cmeColour(stops[stops.length - 1][0])).toEqual(hex(stops[stops.length - 1][1]));
    expect(cmeColour(100)).toEqual(hex(stops[0][1]));
    expect(cmeColour(9000)).toEqual(hex(stops[stops.length - 1][1]));
    const [a, b] = [stops[1], stops[2]];
    const mid = cmeColour((a[0] + b[0]) / 2);
    mid.forEach((c, k) => expect(Math.abs(c - (hex(a[1])[k] + hex(b[1])[k]) / 2)).toBeLessThanOrEqual(1));
  });
});

describe('a CME as plasma (SW27)', () => {
  it('has the parts a coronagraph films, in their places: a ragged front, a cavity behind it, a core near the axis, a shock ahead', () => {
    const particles = plasmaParticles('c1');
    expect(particles).toHaveLength(PLASMA_PARTICLES);
    const of = (part: string) => particles.filter((p) => p.part === part);
    for (const p of of('front')) { expect(p.f).toBeGreaterThanOrEqual(0.86); expect(p.f).toBeLessThanOrEqual(1); }
    for (const p of of('cavity')) { expect(p.f).toBeGreaterThanOrEqual(0.45); expect(p.f).toBeLessThan(0.86); }
    for (const p of of('core')) { expect(p.t).toBeLessThanOrEqual(0.35); expect(p.f).toBeLessThan(0.48); }
    for (const p of of('shock')) expect(p.f).toBeGreaterThan(1);
    // The front holds most of the light it gives, the cavity least.
    expect(of('front').length).toBeGreaterThan(of('cavity').length + of('core').length);
  });

  it('lays a CME out alike every time, so a card draws it alike, and two CMEs differently', () => {
    expect(plasmaParticles('c1').slice(0, 20)).toEqual(plasmaParticles('c1').slice(0, 20));
    expect(plasmaParticles('c1')[0].phi).not.toBe(plasmaParticles('c2')[0].phi);
  });

  it('grows with its front inside its cone: every particle within the half-width, the shock a little wider', () => {
    const axis = capPointAu(cme, 0, 0, 1);
    for (const particle of plasmaParticles('c1').slice(0, 400)) {
      const at = plasmaPointAu(cme, particle, 0.8);
      const r = Math.hypot(...at);
      const angle = Math.acos((at[0] * axis[0] + at[1] * axis[1] + at[2] * axis[2]) / r) * 180 / Math.PI;
      expect(angle).toBeLessThanOrEqual(cme.halfAngle * (particle.part === 'shock' ? 1.15 : 1) + 1e-6);
      expect(r).toBeLessThanOrEqual(0.8 * 1.12);
    }
  });

  it('draws at its front, round the Sun as drawn, brighter when Earth-directed, dimmer when slow', () => {
    const plasma = createCmePlasma(cme);
    expect(plasma.object.name).toBe('cme-c1');
    expect(plasma.object.geometry.getAttribute('spot').count).toBe(PLASMA_PARTICLES);
    const u = (plasma.object.material as THREE.ShaderMaterial).uniforms;
    plasma.setFront(0.7);
    expect(u.front.value).toBe(0.7);
    near((u.axis.value as THREE.Vector3).toArray(), capPointAu(cme, 0, 0, 1));
    expect(u.halfAngle.value).toBeCloseTo(Math.PI / 4, 12);
    expect(u.earthward.value).toBe(1);
    const tilted = sunEarthBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.6, 0.8));
    plasma.setBasis(tilted);
    near((u.zAxis.value as THREE.Vector3).toArray(), tilted.z.toArray());
    const away = createCmePlasma({ ...cme, id: 'c2', lon: 120 });
    const ua = (away.object.material as THREE.ShaderMaterial).uniforms;
    expect(ua.earthward.value).toBe(0);
    near((ua.color.value as THREE.Vector3).toArray(), cmeColour(1553).map((c) => c / 255));
    expect(u.strength.value).toBeGreaterThan(ua.strength.value);
    const slow = createCmePlasma({ ...cme, id: 'c3', lon: 120, speed: 400 });
    expect((slow.object.material as THREE.ShaderMaterial).uniforms.strength.value).toBe(shellStrength(400));
    expect(shellStrength(300)).toBeLessThan(shellStrength(800));
    expect(shellStrength(5000)).toBe(1);
    for (const each of [plasma, away, slow]) each.dispose();
  });
});
