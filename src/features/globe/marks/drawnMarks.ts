/**
 * Every mark drawn on the globe that says what it is, read from the marks themselves (pointTooltipRegistry's
 * groups): a sprite's or a screen point's own position, its words, what it opens, its layer and, where it keeps one,
 * its time. The inspector's "near it" (relatedMarks.ts) and the time bar's density strip (critique-2026-11-01, OR17,
 * OR25) both read the globe this way, so neither needs an adapter per layer, and both see only what is drawn.
 */
import * as THREE from 'three';
import { globeWorldToLatLng } from '../../../utils/globeCoordinates';
import type { GlobeNoteSet } from '../noteDetail/globeNoteStore';

/** A sprite's time where it states none (intelReportSprites UNTIMED). */
const UNTIMED_BELOW = -1e8;

export interface DrawnMark {
  /** Its hover's words. */
  tooltip: string;
  /** The layer that drew it, as it names itself. */
  layer: string | null;
  at: { lat: number; lng: number };
  /** When it happened, ms since the epoch, or null where it keeps no time. */
  timeMs: number | null;
  opens: GlobeNoteSet | null;
}

/** Whether an object is drawn: it and every parent visible. */
export const isDrawn = (o: THREE.Object3D): boolean => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** The layer a mark is on: its own entry in `layers`, or the nearest `layer` up its tree. */
const layerOf = (o: THREE.Object3D, index: number): string | null => {
  const own = (o.userData as { layers?: unknown }).layers;
  if (Array.isArray(own) && typeof own[index] === 'string') return own[index] as string;
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const name = (p.userData as { layer?: unknown }).layer;
    if (typeof name === 'string' && name) return name;
  }
  return null;
};

/** Calls `visit` for each drawn point mark with words of its own; `visit` returning false stops the walk. */
export function eachDrawnMark(groups: readonly THREE.Object3D[], visit: (mark: DrawnMark) => boolean | void): void {
  const world = new THREE.Vector3();
  let stopped = false;
  for (const group of groups) {
    if (stopped) return;
    group.updateMatrixWorld();
    group.traverse((o) => {
      if (stopped || !(o instanceof THREE.Points) || !isDrawn(o)) return;
      const data = o.userData as { tooltips?: string[]; opens?: Array<GlobeNoteSet | null>; timeBaseMs?: number; repeats?: boolean };
      // A layer's chips and badges beside marks it draws already (a quake stack's "+N", an atlas quake's badge): never
      // a mark of their own, so neither counted on the time bar nor listed as related.
      if (data.repeats === true) return;
      const tooltips = data.tooltips;
      const position = o.geometry.getAttribute('position');
      if (!Array.isArray(tooltips) || !position) return;
      const times = o.geometry.getAttribute('markTime');
      for (let i = 0; i < position.count && !stopped; i++) {
        const tooltip = tooltips[i];
        if (!tooltip) continue;
        const opens = data.opens?.[i] ?? null;
        world.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
        const seconds = times ? times.getX(i) : null;
        const timeMs = seconds !== null && seconds > UNTIMED_BELOW && typeof data.timeBaseMs === 'number'
          ? data.timeBaseMs + seconds * 1000 : opens?.notes[0]?.timeMs ?? null;
        if (visit({ tooltip, layer: layerOf(o, i), at: globeWorldToLatLng(world), timeMs, opens }) === false) stopped = true;
      }
    });
  }
}
