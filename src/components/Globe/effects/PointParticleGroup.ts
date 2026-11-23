/**
 * PointParticleGroup — a small, generic, continuously-respawning stream of drifting,
 * fading point-sprite particles, built directly on FlarePool (src/solar-system/
 * effects/FlarePool.ts — confirmed to import only `three`, zero solar-system
 * coupling, so imported here directly rather than forked).
 *
 * One instance is reused for volcano ash plumes (useGlobeVolcanoPlumes.ts) AND
 * weather-grid rain (useGlobeEarthWeather.ts) — the same particle mechanics
 * (spawn near an origin, drift, fade, respawn) apply to both; only the per-emitter
 * direction/color/size/count differ. This is the shared module the plan called for
 * instead of building two near-identical systems.
 */
import * as THREE from 'three';
import { FlarePool } from '../../../solar-system/effects/FlarePool';

export interface ParticleEmitterSpec {
  /** Stable per real-world source (e.g. a volcano's EONET id, a weather-grid point index) — used to match particles to their emitter across frames, not a display name. */
  id: string;
  /** Spawn origin in globe scene-space (world units). */
  origin: THREE.Vector3;
  /** Per-second position delta (world units/sec) — direction and speed of drift. */
  drift: THREE.Vector3;
  color: number;
  size: number;
  /** Concurrent particles this emitter tries to keep alive. */
  count: number;
  lifespanMs: number;
  /** Random per-particle spawn offset radius, for a less uniform-looking stream. */
  spread: number;
}

interface LiveParticle {
  points: THREE.Points;
  emitterId: string;
  origin: THREE.Vector3;
  drift: THREE.Vector3;
  spawnTime: number;
  lifespanMs: number;
}

export class PointParticleGroup {
  readonly group = new THREE.Group();
  private readonly pool: FlarePool;
  private particles: LiveParticle[] = [];

  constructor(maxPoolSize: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.pool = new FlarePool({ geometry, maxPoolSize });
  }

  /**
   * Reconciles live particles against the current set of real emitters — drops
   * particles whose emitter no longer exists (e.g. a real eruption/rain cell ended)
   * and tops each remaining emitter back up to its target `count`. Call once per
   * animation frame alongside update().
   */
  sync(specs: ParticleEmitterSpec[], now: number): void {
    const activeIds = new Set(specs.map((s) => s.id));
    this.particles = this.particles.filter((p) => {
      if (activeIds.has(p.emitterId)) return true;
      this.pool.release(p.points);
      this.group.remove(p.points);
      return false;
    });

    specs.forEach((spec) => {
      const currentCount = this.particles.reduce((n, p) => n + (p.emitterId === spec.id ? 1 : 0), 0);
      const deficit = spec.count - currentCount;
      for (let i = 0; i < deficit; i++) {
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * spec.spread,
          (Math.random() - 0.5) * spec.spread,
          (Math.random() - 0.5) * spec.spread
        );
        const spawnPos = spec.origin.clone().add(jitter);
        const points = this.pool.acquire({ position: spawnPos, color: spec.color, size: spec.size });
        if (!points) return; // real pool cap hit — stop topping up this emitter for now
        this.group.add(points);
        this.particles.push({
          points,
          emitterId: spec.id,
          origin: spawnPos,
          drift: spec.drift,
          spawnTime: now,
          lifespanMs: spec.lifespanMs
        });
      }
    });
  }

  /** Advances every live particle's position/opacity by real elapsed time; releases expired ones. */
  update(now: number): void {
    const stillAlive: LiveParticle[] = [];
    this.particles.forEach((p) => {
      const ageMs = now - p.spawnTime;
      if (ageMs >= p.lifespanMs) {
        this.pool.release(p.points);
        this.group.remove(p.points);
        return;
      }
      p.points.position.copy(p.origin).addScaledVector(p.drift, ageMs / 1000);
      const material = p.points.material as THREE.PointsMaterial;
      material.opacity = 1 - ageMs / p.lifespanMs;
      stillAlive.push(p);
    });
    this.particles = stillAlive;
  }

  getLiveParticleCount(): number {
    return this.particles.length;
  }

  dispose(): void {
    this.particles.forEach((p) => {
      this.pool.release(p.points);
      this.group.remove(p.points);
    });
    this.particles = [];
    this.pool.dispose();
  }
}
