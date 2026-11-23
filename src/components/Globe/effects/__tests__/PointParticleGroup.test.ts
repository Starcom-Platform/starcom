import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PointParticleGroup, type ParticleEmitterSpec } from '../PointParticleGroup';

const makeSpec = (overrides: Partial<ParticleEmitterSpec> = {}): ParticleEmitterSpec => ({
  id: 'a',
  origin: new THREE.Vector3(100, 0, 0),
  drift: new THREE.Vector3(1, 0, 0),
  color: 0xff0000,
  size: 0.5,
  count: 5,
  lifespanMs: 1000,
  spread: 0.2,
  ...overrides
});

describe('PointParticleGroup', () => {
  it('spawns up to the requested real particle count for a new emitter', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ count: 5 })], 0);
    expect(pg.getLiveParticleCount()).toBe(5);
    expect(pg.group.children).toHaveLength(5);
  });

  it('respects the real pool cap rather than exceeding it', () => {
    const pg = new PointParticleGroup(3);
    pg.sync([makeSpec({ count: 10 })], 0);
    expect(pg.getLiveParticleCount()).toBe(3);
  });

  it('does not spawn duplicate particles for an emitter already at its target count on repeated sync calls', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ count: 5 })], 0);
    pg.sync([makeSpec({ count: 5 })], 10);
    expect(pg.getLiveParticleCount()).toBe(5);
  });

  it('removes particles whose real emitter no longer exists', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ id: 'a' }), makeSpec({ id: 'b' })], 0);
    expect(pg.getLiveParticleCount()).toBe(10);

    pg.sync([makeSpec({ id: 'a' })], 10); // 'b' dropped
    expect(pg.getLiveParticleCount()).toBe(5);
    expect(pg.group.children).toHaveLength(5);
  });

  it('fades opacity toward 0 as a particle ages, and removes it once past its real lifespan', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ count: 1, lifespanMs: 1000 })], 0);
    const points = pg.group.children[0] as THREE.Points;
    const material = points.material as THREE.PointsMaterial;
    expect(material.opacity).toBe(1);

    pg.update(500); // halfway through its lifespan
    expect(material.opacity).toBeCloseTo(0.5, 5);

    pg.update(1000); // past its lifespan
    expect(pg.getLiveParticleCount()).toBe(0);
    expect(pg.group.children).toHaveLength(0);
  });

  it('moves a particle along its real drift vector over elapsed time', () => {
    const pg = new PointParticleGroup(100);
    const origin = new THREE.Vector3(100, 0, 0);
    pg.sync([makeSpec({ count: 1, spread: 0, origin, drift: new THREE.Vector3(0, 2, 0), lifespanMs: 5000 })], 0);
    const points = pg.group.children[0] as THREE.Points;

    pg.update(2000); // 2 real seconds elapsed, drift = 2 units/sec on Y
    expect(points.position.y).toBeCloseTo(4, 5);
  });

  it('tops a depleted emitter back up to its target count on the next sync after particles expire', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ count: 3, lifespanMs: 100 })], 0);
    expect(pg.getLiveParticleCount()).toBe(3);

    pg.update(150); // all 3 expire
    expect(pg.getLiveParticleCount()).toBe(0);

    pg.sync([makeSpec({ count: 3, lifespanMs: 100 })], 150);
    expect(pg.getLiveParticleCount()).toBe(3);
  });

  it('dispose() clears every live particle from the group', () => {
    const pg = new PointParticleGroup(100);
    pg.sync([makeSpec({ count: 4 })], 0);
    pg.dispose();
    expect(pg.getLiveParticleCount()).toBe(0);
    expect(pg.group.children).toHaveLength(0);
  });
});
