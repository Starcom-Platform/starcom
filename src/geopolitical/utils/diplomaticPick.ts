/**
 * Which place a click on Diplomacy's marks picked (decision D-DP, DP8, the drawer). A raycast passes
 * close to several Points at once, through the globe and out the far side: the mark nearest the
 * pointer wins, among those the camera can see. Each mark object keeps its places'
 * keys in `userData.placeKeys`, in the order of its marks.
 */
import * as THREE from 'three';
import { visibleHits } from '../../components/Globe/pickRadius';
import { GLOBE_RADIUS } from '../../components/Globe/zoomOutFade';

/** The nearest seen mark's place (pickRadius.ts's visibleHits: never one beyond the horizon), or null. */
export function placeKeyAtHits(hits: readonly THREE.Intersection[], cameraPosition: THREE.Vector3, globeRadius = GLOBE_RADIUS): string | null {
  let best: { key: string; distance: number } | null = null;
  for (const hit of visibleHits(hits, cameraPosition, globeRadius)) {
    const keys = hit.object.userData?.placeKeys as readonly string[] | undefined;
    if (!keys || hit.index === undefined || !keys[hit.index]) continue;
    const distance = hit.distanceToRay ?? Number.POSITIVE_INFINITY;
    if (!best || distance < best.distance) best = { key: keys[hit.index], distance };
  }
  return best?.key ?? null;
}

/** How far past its drawn edge a mark still takes a click, in pixels. */
const MARK_SLOP_PX = 2;

/**
 * Whether a hit lies within its own mark as drawn: half its size in pixels (its `pointSize`), and a
 * little slop. A flat radius took clicks well off a small mark, from the country beside it.
 */
export function withinItsMark(hit: THREE.Intersection, unitsPerPx: number): boolean {
  const sizes = (hit.object as THREE.Points).geometry?.getAttribute?.('pointSize');
  if (!sizes || hit.index === undefined || hit.distanceToRay === undefined) return false;
  return hit.distanceToRay <= unitsPerPx * (sizes.getX(hit.index) / 2 + MARK_SLOP_PX);
}
