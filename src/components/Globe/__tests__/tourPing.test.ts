/**
 * The briefing tour's ping (critique C34): put on the place a stop holds, for as long as it is held, and gone with
 * no stop held; never a pick target.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTourPing, TOUR_PING_TYPE, TOUR_RING_PX } from '../glyphOverlays';

describe('buildTourPing', () => {
  it('rings the place it is shown on, and draws nothing once taken away', () => {
    const ping = buildTourPing(new THREE.Color(0x00c3db));
    expect(ping.mesh.userData.type).toBe(TOUR_PING_TYPE);
    const geometry = ping.mesh.geometry;
    const level = () => geometry.getAttribute('level').getX(0);

    ping.show(new THREE.Vector3(10, 20, 30), 700);
    const corners = geometry.getAttribute('position');
    for (let k = 0; k < 4; k += 1) expect([corners.getX(k), corners.getY(k), corners.getZ(k)]).toEqual([10, 20, 30]);
    expect(geometry.getAttribute('radiusPx').getX(0)).toBe(TOUR_RING_PX);
    expect(level()).toBe(1);
    expect((ping.mesh.material as THREE.ShaderMaterial).uniforms.heldMs.value).toBe(700);

    ping.show(null, 0);
    expect(level()).toBe(0);
  });

  it('is never hit by a pick: the mark under it hovers and opens', () => {
    const ping = buildTourPing(new THREE.Color(0x00c3db));
    const hits: THREE.Intersection[] = [];
    ping.mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });
});
