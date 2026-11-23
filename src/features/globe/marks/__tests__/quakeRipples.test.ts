/**
 * A strong quake's ripple (D-EQ, EQ10): which quakes ripple, and how a ripple moves on screen, in a clip and in a
 * card (IM23: a card holds motion at rest; a clip's frames move it by their moments).
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildQuakeRipples, RIPPLE_FROM_MAGNITUDE, RIPPLE_LIMIT, ripplePhaseNow, ripplingOf } from '../quakeRipples';
import { holdForCapture, phaseSeconds, releaseMotion, stillMotion } from '../../../../globe-engine/captureClock';

const quake = (magnitude: number, lat = 10, lng = 20) => ({ lat, lng, magnitude });

describe('which quakes ripple', () => {
  it('those of the magnitude or more, the strongest first, up to the limit', () => {
    expect(ripplingOf([quake(4.9), quake(RIPPLE_FROM_MAGNITUDE), quake(6.1)]).map((q) => q.magnitude)).toEqual([6.1, 5]);
    const many = Array.from({ length: RIPPLE_LIMIT + 5 }, (_, i) => quake(5 + i / 100, i, i));
    expect(ripplingOf(many)).toHaveLength(RIPPLE_LIMIT);
    expect(ripplingOf(many)[0].magnitude).toBeCloseTo(5 + (RIPPLE_LIMIT + 4) / 100, 6);
    expect(buildQuakeRipples([quake(3), quake(4.9)], { type: 'q' })).toBeNull();
  });

  it('as one mesh, a square on the ground for each', () => {
    const mesh = buildQuakeRipples([quake(5.4), quake(6.2, -30, 140), quake(2)], { type: 'q' }) as THREE.Mesh;
    expect(mesh.geometry.getAttribute('position').count).toBe(8);
    expect(mesh.geometry.getIndex()?.count).toBe(12);
    expect(mesh.userData).toMatchObject({ type: 'q', rippling: 2 });
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});

describe('a ripple in time', () => {
  afterEach(() => releaseMotion());

  it('moves with the clock on screen', () => {
    expect(ripplePhaseNow(1_000_000)).toBe(phaseSeconds(1_000_000));
  });

  it("is unseen on a card, and moves by each frame's moment in a clip", () => {
    stillMotion(5_000);
    expect(ripplePhaseNow()).toBeNull();
    releaseMotion();
    const release = holdForCapture();
    stillMotion(7_200);
    expect(ripplePhaseNow()).toBe(phaseSeconds(7_200));
    releaseMotion();
    release();
  });
});
