/**
 * What else is drawn near an item, and around its time (critique-2026-11-01, OR16, OR22; plan A5): every mark that
 * answers a hover on the layers drawn, within a radius tied to the view (about a tenth of what is on screen) and the
 * time window shown. Read from the marks themselves (pointTooltipRegistry's groups), so every layer that says what
 * its marks are takes part without an adapter: a sprite's or a screen point's position, its words, what it opens and,
 * where it keeps one, its time.
 */
import * as THREE from 'three';
import { globeWorldToLatLng } from '../../../utils/globeCoordinates';
import type { GlobeNoteSet } from '../noteDetail/globeNoteStore';
import { eachDrawnMark, isDrawn } from '../marks/drawnMarks';

export const EARTH_RADIUS_KM = 6371;
/** How many the inspector lists: the nearest first. */
export const RELATED_SHOWN = 8;
export interface LatLng { lat: number; lng: number }

export interface RelatedMark {
  /** The first line of its hover. */
  title: string;
  /** The layer that drew it, as it names itself. */
  layer: string | null;
  at: LatLng;
  distanceKm: number;
  timeMs: number | null;
  opens: GlobeNoteSet | null;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Half the camera's vertical field of view, a little wider: how far the screen reaches from its centre, close in. */
const HALF_VIEW = Math.tan((28 * Math.PI) / 180);

/**
 * The radius "related" reaches at a camera's height above the surface, in Earth radii: a tenth of the span of ground
 * in view, which close in is the camera's field of view and far out the horizon; never under 25 km nor over 2,000 km.
 */
export function relatedRadiusKm(altitudeRadii: number): number {
  const a = Math.max(0, altitudeRadii);
  const horizonKm = Math.acos(1 / (1 + a)) * EARTH_RADIUS_KM;
  const viewKm = a * EARTH_RADIUS_KM * HALF_VIEW;
  return Math.min(2000, Math.max(25, 0.1 * 2 * Math.min(horizonKm, viewKm)));
}

export interface RelatedQuery {
  at: LatLng;
  radiusKm: number;
  /** The window shown, or null while live: then whatever is drawn is current. */
  window: { start: number; end: number } | null;
  /** The item's own notes: never listed as related to itself. */
  self?: GlobeNoteSet | null;
}

/** The marks near an item, nearest first. */
export function relatedMarks(groups: readonly THREE.Object3D[], query: RelatedQuery): RelatedMark[] {
  const found: RelatedMark[] = [];
  const selfIds = new Set((query.self?.notes ?? []).map((n) => n.id));
  eachDrawnMark(groups, (mark) => {
    if (mark.opens?.notes.some((n) => selfIds.has(n.id))) return;
    const d = distanceKm(query.at, mark.at);
    if (d > query.radiusKm) return;
    if (query.window && mark.timeMs !== null && (mark.timeMs < query.window.start || mark.timeMs > query.window.end)) return;
    found.push({ title: mark.tooltip.split('\n')[0], layer: mark.layer, at: mark.at, distanceKm: d, timeMs: mark.timeMs, opens: mark.opens });
  });
  return found.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, RELATED_SHOWN);
}

/**
 * The drawn mark whose notes hold a note id, with its place: what a link's `open=` reopens (OR23). A point's own
 * position, or a fill's centre of bounds; null while no layer drawn holds it.
 */
export function findMarkByNoteId(groups: readonly THREE.Object3D[], id: string): { at: LatLng; opens: GlobeNoteSet; index: number } | null {
  const world = new THREE.Vector3();
  let hit: { at: LatLng; opens: GlobeNoteSet; index: number } | null = null;
  for (const group of groups) {
    if (hit) break;
    group.updateMatrixWorld();
    group.traverse((o) => {
      if (hit || !isDrawn(o)) return;
      if (o instanceof THREE.Points) {
        const opens = (o.userData as { opens?: Array<GlobeNoteSet | null> }).opens;
        const position = o.geometry.getAttribute('position');
        if (!Array.isArray(opens) || !position) return;
        for (let i = 0; i < opens.length && !hit; i++) {
          const index = opens[i]?.notes.findIndex((n) => n.id === id) ?? -1;
          if (index < 0) continue;
          world.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
          hit = { at: globeWorldToLatLng(world), opens: opens[i]!, index };
        }
      } else if ((o as THREE.Mesh).isMesh) {
        const opens = (o.userData as { opens?: GlobeNoteSet | null }).opens;
        const index = opens?.notes.findIndex((n) => n.id === id) ?? -1;
        if (!opens || index < 0) return;
        const mesh = o as THREE.Mesh;
        mesh.geometry.computeBoundingSphere();
        const centre = mesh.geometry.boundingSphere?.center.clone().applyMatrix4(mesh.matrixWorld);
        if (centre) hit = { at: globeWorldToLatLng(centre), opens, index };
      }
    });
  }
  return hit;
}
