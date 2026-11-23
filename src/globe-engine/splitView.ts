/**
 * The globe split down the middle (decision D-PW, PW63, PW73): the Psi layers at now on the left and at the cursor on
 * the right, every other layer drawn once. Each Psi layer is drawn twice, its two groups clipped to their halves by a
 * plane through the camera along its view, turned with it every render, so the split stays down the middle of the
 * screen however the globe is turned. A capture shows the cursor's whole globe: the split is the screen's alone.
 */
import * as THREE from 'three';
import { onSceneRender } from './sceneRenderHooks';
import { onStill } from './captureClock';

export type SplitSide = 'now' | 'cursor';

/** Which half each split group draws in. */
const groups = new Map<THREE.Object3D, SplitSide>();
const left = new THREE.Plane();
const right = new THREE.Plane();
const LEFT: THREE.Plane[] = [left];
const RIGHT: THREE.Plane[] = [right];
let on = false;
let stilled = false;

/** Draw a Psi layer's group in one half while the split is on, or everywhere (null). */
export function splitGroup(group: THREE.Object3D, side: SplitSide | null): () => void {
  if (side) groups.set(group, side);
  else groups.delete(group);
  return () => { groups.delete(group); };
}

export function setSplitOn(next: boolean): void { on = next; }
export const splitOn = (): boolean => on;

/** The planes for a camera: a point at world `p` is on the right where its offset from the camera points along the camera's right. */
export function splitPlanes(camera: THREE.Camera): { left: THREE.Plane; right: THREE.Plane } {
  const position = camera.getWorldPosition(new THREE.Vector3());
  const along = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).normalize();
  right.set(along, -along.dot(position));
  left.set(along.clone().negate(), along.dot(position));
  return { left, right };
}

function apply(object: THREE.Object3D, planes: THREE.Plane[] | null): void {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) {
      if (m.clippingPlanes === planes || (!planes && !m.clippingPlanes?.length)) continue;
      m.clippingPlanes = planes;
      m.needsUpdate = true;
    }
  });
}

/** Turns the planes with the camera each render, and sets each split group's half; returns how to stop. */
export function installSplit(scene: THREE.Scene): () => void {
  const stop = onSceneRender(scene, (renderer, camera) => {
    const splitting = on && !stilled;
    if (splitting) {
      renderer.localClippingEnabled = true;
      splitPlanes(camera);
    }
    for (const [group, side] of groups) {
      // A capture draws the cursor's globe whole, and none of now's.
      if (side === 'now') group.visible = splitting;
      apply(group, splitting ? (side === 'now' ? LEFT : RIGHT) : null);
    }
  });
  const stopStill = onStill({ still: () => { stilled = true; }, release: () => { stilled = false; } });
  return () => {
    stop();
    stopStill();
    // Whole again: no group keeps a half.
    for (const [group, side] of groups) {
      apply(group, null);
      if (side === 'now') group.visible = false;
    }
  };
}

/** Test-only: forget every group and turn the split off. */
export function resetSplitForTests(): void { groups.clear(); on = false; stilled = false; }
