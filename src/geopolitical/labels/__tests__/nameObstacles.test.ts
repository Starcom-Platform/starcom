/**
 * The marks a country's name keeps clear of (decision K5, step 4).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HARD_MARK_PX, nameObstacles } from '../nameObstacles';
import { ridesShell } from '../../../globe-engine/shellLift';

const viewport = { width: 800, height: 600 };

function camera() {
  const c = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10_000);
  c.position.set(0, 0, 350);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** Points facing the camera, with a size each, hoverable unless told otherwise. */
function points(sizes: number[], userData: Record<string, unknown> = { tooltips: sizes.map(() => 'a mark') }, opacity?: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sizes.flatMap((_, i) => [i * 10, 0, 101])), 3));
  geometry.setAttribute('pointSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
  if (opacity) geometry.setAttribute('markOpacity', new THREE.BufferAttribute(new Float32Array(opacity), 1));
  const object = new THREE.Points(geometry);
  object.userData = userData;
  return object;
}

function scene(...roots: THREE.Object3D[]) {
  const s = new THREE.Scene();
  s.add(...roots);
  s.updateMatrixWorld(true);
  return s;
}

describe('nameObstacles', () => {
  it('counts a large mark as never to be covered, and a small dot as one a name may cover a few of', () => {
    const root = ridesShell(new THREE.Group());
    root.add(points([HARD_MARK_PX, 6]));
    const found = nameObstacles(scene(root), camera(), viewport);
    expect(found.hard).toHaveLength(1);
    expect(found.soft).toHaveLength(1);
    expect(found.hard[0].width).toBe(HARD_MARK_PX);
  });

  it('takes a layer\'s word for its marks, and places a badge where it is drawn', () => {
    const root = ridesShell(new THREE.Group());
    root.add(points([6], { nameObstacle: 'hard' }));
    root.add(points([6], { nameObstacle: 'hard', nameObstacleSizePx: 17, nameObstacleOffsetPx: 13 }));
    const found = nameObstacles(scene(root), camera(), viewport);
    expect(found.hard).toHaveLength(2);
    const [mark, badge] = found.hard;
    expect(badge.width).toBe(17);
    expect(badge.x + badge.width / 2 - (mark.x + mark.width / 2)).toBeCloseTo(13, 6);
    expect(badge.y + badge.height / 2 - (mark.y + mark.height / 2)).toBeCloseTo(-13, 6);
  });

  it('keeps clear of a layer\'s boxes drawn beside a place, as Hero Watch\'s relief pills are, and not on the far side', () => {
    const root = ridesShell(new THREE.Group());
    const pills = new THREE.Mesh(new THREE.BufferGeometry());
    pills.userData = { nameObstacleRects: [
      { at: [0, 0, 101], offsetXPx: 17, widthPx: 96, heightPx: 18 },
      { at: [0, 0, -101], offsetXPx: 17, widthPx: 96, heightPx: 18 },
    ] };
    root.add(pills, points([HARD_MARK_PX]));
    const found = nameObstacles(scene(root), camera(), viewport);
    expect(found.hard).toHaveLength(2);
    const [pill, mark] = [found.hard.find((b) => b.width === 96)!, found.hard.find((b) => b.width === HARD_MARK_PX)!];
    // Its left edge 17 px right of the place, its middle level with it.
    expect(pill.x - (mark.x + mark.width / 2)).toBeCloseTo(17, 6);
    expect(pill.y + pill.height / 2 - (mark.y + mark.height / 2)).toBeCloseTo(0, 6);
    expect(pill.height).toBe(18);
    pills.visible = false;
    expect(nameObstacles(scene(root), camera(), viewport).hard).toHaveLength(1);
  });

  it('ignores the sky, marks no one can hover, faded marks and the far side', () => {
    const sky = new THREE.Group();
    sky.add(points([20]));
    const rider = ridesShell(new THREE.Group());
    rider.add(points([20], {}));
    rider.add(points([20, 20], { tooltips: ['a', 'b'] }, [0, 1]));
    const behind = points([20]);
    behind.position.set(0, 0, -300);
    rider.add(behind);
    const found = nameObstacles(scene(sky, rider), camera(), viewport);
    expect(found.hard).toHaveLength(1);
  });

  it('fills the arrays it is given rather than making new ones', () => {
    const root = ridesShell(new THREE.Group());
    root.add(points([20]));
    const s = scene(root);
    const into = { hard: [], soft: [] };
    const first = nameObstacles(s, camera(), viewport, into);
    const second = nameObstacles(s, camera(), viewport, into);
    expect(second).toBe(first);
    expect(second.hard).toBe(into.hard);
    expect(second.hard).toHaveLength(1);
  });
});
