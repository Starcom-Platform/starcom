/**
 * Side by side (D-PW, PW63, PW73): planes through the camera along its view, split down the screen's middle however
 * the globe is turned; now's groups clipped to the left half and the cursor's to the right while the split is on; a
 * capture draws the cursor's globe whole and none of now's; turned off, every group is whole again.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installSplit, resetSplitForTests, setSplitOn, splitGroup, splitPlanes } from '../splitView';
import { releaseMotion, stillMotion } from '../captureClock';

const camera = (from: THREE.Vector3) => {
  const c = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  c.position.copy(from);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
};
const groupWith = () => {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  return group;
};
const planesOf = (group: THREE.Group) => ((group.children[0] as THREE.Mesh).material as THREE.Material).clippingPlanes;
const renderOnce = (scene: THREE.Scene, cam: THREE.Camera, renderer = { localClippingEnabled: false }) => {
  scene.onBeforeRender(renderer as never, scene, cam, undefined as never, undefined as never, undefined as never);
  return renderer;
};

describe('the split', () => {
  afterEach(() => resetSplitForTests());

  it('splits down the screen\'s middle, from wherever the camera looks', () => {
    for (const from of [new THREE.Vector3(0, 0, 300), new THREE.Vector3(300, 0, 0), new THREE.Vector3(0, 250, 150)]) {
      const cam = camera(from);
      const { left, right } = splitPlanes(cam);
      const onRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(50);
      expect(right.distanceToPoint(onRight)).toBeGreaterThan(0);
      expect(left.distanceToPoint(onRight)).toBeLessThan(0);
      expect(left.distanceToPoint(onRight.clone().negate())).toBeGreaterThan(0);
      // The globe's middle, straight ahead, is on the line between.
      expect(Math.abs(right.distanceToPoint(new THREE.Vector3(0, 0, 0)))).toBeLessThan(1e-9);
    }
  });

  it('clips now\'s groups to the left and the cursor\'s to the right while on, and draws them whole while off', () => {
    const scene = new THREE.Scene();
    const now = groupWith();
    const cursor = groupWith();
    splitGroup(now, 'now');
    splitGroup(cursor, 'cursor');
    const stop = installSplit(scene);
    const cam = camera(new THREE.Vector3(0, 0, 300));
    setSplitOn(true);
    const renderer = renderOnce(scene, cam);
    expect(renderer.localClippingEnabled).toBe(true);
    expect(planesOf(now)?.[0].normal.x).toBeCloseTo(-1, 6);
    expect(planesOf(cursor)?.[0].normal.x).toBeCloseTo(1, 6);
    expect(now.visible).toBe(true);
    setSplitOn(false);
    renderOnce(scene, cam);
    expect([planesOf(now), planesOf(cursor)]).toEqual([null, null]);
    expect(now.visible).toBe(false);
    stop();
  });

  it('draws a capture\'s globe whole, the cursor\'s alone, and splits again after', () => {
    const scene = new THREE.Scene();
    const now = groupWith();
    const cursor = groupWith();
    splitGroup(now, 'now');
    splitGroup(cursor, 'cursor');
    const stop = installSplit(scene);
    const cam = camera(new THREE.Vector3(0, 0, 300));
    setSplitOn(true);
    stillMotion(Date.UTC(2026, 10, 1));
    renderOnce(scene, cam);
    expect([now.visible, planesOf(cursor)]).toEqual([false, null]);
    releaseMotion();
    renderOnce(scene, cam);
    expect(now.visible).toBe(true);
    expect(planesOf(cursor)).toHaveLength(1);
    stop();
  });

  it('leaves every group whole once uninstalled', () => {
    const scene = new THREE.Scene();
    const cursor = groupWith();
    splitGroup(cursor, 'cursor');
    const stop = installSplit(scene);
    setSplitOn(true);
    renderOnce(scene, camera(new THREE.Vector3(0, 0, 300)));
    expect(planesOf(cursor)).toHaveLength(1);
    stop();
    expect(planesOf(cursor)).toBeNull();
  });
});
