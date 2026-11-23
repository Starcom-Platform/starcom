/**
 * The solar wind's particles from the Sun to the Earth, drawn (space-weather-visualization.md, SW6,
 * SW7, SW17): in the Sun-Earth frame aligned to the drawn Sun, at the solar system's compressed
 * distances, so the hindcast's Sun falls on the drawn one and its Earth on the globe.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHeliosphereParticles, drawnParticle, eclipticPoleAt, sunEarthBasis } from '../heliosphereParticles';
import { daysToEarth, windSources } from '../../../../services/spaceWeather/heliosphere';
import { drawnDistance, skyFrame, sunInSky } from '../../../../solar-system/bodyPlacement';
import { GLOBE_UNITS_PER_AU } from '../../../../solar-system/EphemerisService';

const AT = new Date(Date.UTC(2026, 9, 10, 12));
const sun = sunInSky(AT).normalize();
const basis = sunEarthBasis(sun, eclipticPoleAt(skyFrame(AT)));

describe('the Sun-Earth frame in the scene', () => {
  it('is three unit axes at right angles, x from the Sun toward the Earth, z the ecliptic\'s pole', () => {
    for (const v of [basis.x, basis.y, basis.z]) expect(v.length()).toBeCloseTo(1, 9);
    expect(basis.x.dot(basis.y)).toBeCloseTo(0, 9);
    expect(basis.x.dot(basis.z)).toBeCloseTo(0, 9);
    // The Sun lies in the ecliptic: x is all but the Sun's direction reversed.
    expect(THREE.MathUtils.radToDeg(basis.x.angleTo(sun.clone().negate()))).toBeLessThan(0.1);
  });
});

describe('a particle', () => {
  it('leaving the Sun is drawn on the drawn Sun', () => {
    const [source] = windSources([{ arrive: AT.getTime(), speed: 400, density: 5, bx: -3, by: 3, bz: 0 }], AT.getTime());
    const p = drawnParticle(source, 0, basis);
    expect(p.length()).toBeCloseTo(drawnDistance(GLOBE_UNITS_PER_AU), 0);
    expect(THREE.MathUtils.radToDeg(p.clone().normalize().angleTo(sun))).toBeLessThan(0.1);
  });

  it('that reached the Earth at the moment is drawn at the Earth', () => {
    const [source] = windSources([{ arrive: AT.getTime(), speed: 400, density: 5, bx: -3, by: 3, bz: 0 }], AT.getTime());
    expect(drawnParticle(source, daysToEarth(400), basis).length()).toBeLessThan(1);
  });
});

describe('the particles drawn', () => {
  it('are a train of 36 from each source, carrying its speed, polarity, density and turbulence, as added light', () => {
    const sources = [
      { angle: 0.1, speed: 400, density: 5, polarity: 1 as const, turbulence: 0.2 },
      { angle: 0.3, speed: 700, density: 2, polarity: -1 as const, turbulence: 0.6 },
    ];
    const particles = createHeliosphereParticles(sources, { away: '#FFC98A', toward: '#9DB4FF' });
    const g = particles.object.geometry;
    expect(g.getAttribute('speed').count).toBe(72);
    expect(g.getAttribute('speed').getX(36)).toBe(700);
    expect(g.getAttribute('polarity').getX(40)).toBe(-1);
    expect((particles.object.material as THREE.ShaderMaterial).blending).toBe(THREE.AdditiveBlending);
    particles.setBasis(basis);
    expect(((particles.object.material as THREE.ShaderMaterial).uniforms.xAxis.value as THREE.Vector3).equals(basis.x)).toBe(true);
    particles.dispose();
  });
});
