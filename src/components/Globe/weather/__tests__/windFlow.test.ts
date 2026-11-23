/**
 * Where the wind's particles start (decision D-W, WX3). The flow itself runs
 * on the GPU and is checked on the rendered globe; the seeding is not, and it
 * is what lets a still be drawn again the same.
 */
import { describe, it, expect } from 'vitest';
import { seedParticles } from '../windFlow';

describe('seedParticles', () => {
  it('places the same particles for the same seed time, and others for another', () => {
    const a = new Float32Array(4 * 256), b = new Float32Array(4 * 256), c = new Float32Array(4 * 256);
    seedParticles(a, 1_791_250_000);
    seedParticles(b, 1_791_250_000);
    seedParticles(c, 1_791_250_001);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('spreads them evenly over the sphere, not crowded at the poles, each part way through its life', () => {
    const n = 20_000, d = new Float32Array(4 * n);
    seedParticles(d, 42);
    let polar = 0, east = 0;
    for (let k = 0; k < d.length; k += 4) {
      expect(d[k]).toBeGreaterThanOrEqual(0);
      expect(d[k]).toBeLessThan(360);
      expect(Math.abs(d[k + 1])).toBeLessThanOrEqual(90);
      expect(d[k + 2]).toBeGreaterThanOrEqual(0);
      expect(d[k + 3]).toBeGreaterThanOrEqual(0);
      expect(d[k + 3]).toBeLessThan(1);
      if (Math.abs(d[k + 1]) > 60) polar++;
      if (d[k] < 180) east++;
    }
    // Equal area: the caps above 60° hold 1 - sin 60° of the sphere, about 13.4%.
    expect(polar / n).toBeGreaterThan(0.12);
    expect(polar / n).toBeLessThan(0.15);
    expect(east / n).toBeGreaterThan(0.48);
    expect(east / n).toBeLessThan(0.52);
  });
});
