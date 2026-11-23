/**
 * The marks a country's name keeps clear of (decision K5, step 4), as boxes on
 * screen.
 *
 * Every mark a person can hover, on the layers that ride the territories' shell:
 * Points with tooltips, or a layer's own say (`userData.nameObstacle`). The sky
 * (satellites, the solar system) never counts, so names do not vanish under the
 * satellite swarm. A mark 14 px or larger, or one its layer calls hard (the Intel
 * Report glyphs and their count badges), is never covered; a smaller dot may be,
 * a few at a time, or the gauges over the USA would leave it unnamed. A layer that draws
 * words beside a place (Hero Watch's relief pills, a quad, not a point) lists their boxes
 * (`userData.nameObstacleRects`), and those are never covered either.
 */
import * as THREE from 'three';
import { isShellRider } from '../../globe-engine/shellLift';
import type { ScreenBox } from '../../globe-engine/placeNames';

/** At this size or more a mark is never covered. */
export const HARD_MARK_PX = 14;

export interface NameObstacles {
  hard: ScreenBox[];
  soft: ScreenBox[];
}

const v = new THREE.Vector3();
const toCamera = new THREE.Vector3();

/** What a layer may say about its marks to the names. */
interface ObstacleSay {
  nameObstacle?: 'hard' | 'soft';
  /** A mark drawn off its place, as a count badge is, in px. */
  nameObstacleOffsetPx?: number;
  /** A mark of one size, where the geometry carries none. */
  nameObstacleSizePx?: number;
}

/** A box drawn beside a place, in CSS px: its left edge `offsetXPx` right of the place, its middle level with it. */
interface ObstacleRect {
  /** The place, in the object's own frame. */
  at: [number, number, number];
  offsetXPx: number;
  widthPx: number;
  heightPx: number;
}

/**
 * The obstacles in view, in CSS px of a `viewport` the camera draws into. Writes
 * into `into` when given, so a placement many times a second reuses its arrays.
 */
export function nameObstacles(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  into: NameObstacles = { hard: [], soft: [] },
): NameObstacles {
  into.hard.length = 0;
  into.soft.length = 0;
  for (const root of scene.children) {
    if (!isShellRider(root) || !root.visible) continue;
    root.traverseVisible((object) => {
      const rects = object.userData.nameObstacleRects as ObstacleRect[] | undefined;
      if (rects) {
        for (const rect of rects) {
          v.set(rect.at[0], rect.at[1], rect.at[2]).applyMatrix4(object.matrixWorld);
          toCamera.copy(camera.position).sub(v);
          if (v.dot(toCamera) <= 0) continue;
          v.project(camera);
          if (v.z < -1 || v.z > 1) continue;
          const x = ((v.x + 1) / 2) * viewport.width + rect.offsetXPx;
          const y = ((1 - v.y) / 2) * viewport.height - rect.heightPx / 2;
          if (x > viewport.width || y > viewport.height || x + rect.widthPx < 0 || y + rect.heightPx < 0) continue;
          into.hard.push({ x, y, width: rect.widthPx, height: rect.heightPx });
        }
        return;
      }
      if (!(object instanceof THREE.Points)) return;
      const say = object.userData as ObstacleSay & { tooltips?: unknown };
      if (!say.tooltips && !say.nameObstacle) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      const position = geometry.getAttribute('position');
      if (!position) return;
      const sizes = geometry.getAttribute('pointSize');
      const opacity = geometry.getAttribute('markOpacity');
      // A mark folded under another is not drawn (glyphDeclutter.ts).
      const shown = geometry.getAttribute('markShown');
      const offset = say.nameObstacleOffsetPx ?? 0;
      for (let i = 0; i < position.count; i++) {
        if (opacity && opacity.getX(i) <= 0) continue;
        if (shown && shown.getX(i) < 0.5) continue;
        v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        // The far side of the planet: hidden behind it, in no one's way.
        toCamera.copy(camera.position).sub(v);
        if (v.dot(toCamera) <= 0) continue;
        v.project(camera);
        if (v.z < -1 || v.z > 1) continue;
        const size = say.nameObstacleSizePx ?? (sizes ? sizes.getX(i) : HARD_MARK_PX);
        const x = ((v.x + 1) / 2) * viewport.width + offset;
        const y = ((1 - v.y) / 2) * viewport.height - offset;
        if (x < -size || y < -size || x > viewport.width + size || y > viewport.height + size) continue;
        const box = { x: x - size / 2, y: y - size / 2, width: size, height: size };
        if (say.nameObstacle === 'hard' || (say.nameObstacle !== 'soft' && size >= HARD_MARK_PX)) into.hard.push(box);
        else into.soft.push(box);
      }
    });
  }
  return into;
}
