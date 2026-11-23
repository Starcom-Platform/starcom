/**
 * useGlobePointTooltips — real hover tooltips for InstancedMesh point layers.
 *
 * Every InstancedMesh-based hook built this session (useGlobeEarthWeather.ts's
 * weather grid/sea-ice/wind-arrow layers, useGlobeVolcanoCatalog.ts,
 * useGlobeWaterGauges.ts's tide/streamflow layers) already sets
 * `mesh.userData = { type, points: [{ lat, lng, tooltip }] }` — but nothing ever
 * read it back. Confirmed directly: the only real raycast/hover system in this
 * codebase, Enhanced3DGlobeInteractivity.tsx, early-returns unconditionally
 * (`if (!isIntelLikeMode ...) return;`) outside CyberCommand's IntelReports/RLSH
 * modes, so it never touches these EcoNatural-mode point layers at all — this is
 * a second, independent hover system, not a modification of that one. The two
 * were said never to run in the same mode; since Intel Reports became sprites
 * registered here, they do, and a report showed both cards (1 Nov): its own card
 * now holds this one back (hoverOwners.ts).
 *
 * Registered groups (see pointTooltipRegistry.ts) are raycast against on a
 * throttled, movement-delta-gated mousemove handler — the same two guards
 * (throttle interval, minimum pixel movement) Enhanced3DGlobeInteractivity.tsx's
 * own hover detection already uses, reused here for consistency, not coincidence.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { visibleHits } from '../pickRadius';
import { fadedOut, GLOBE_RADIUS } from '../zoomOutFade';
import type { GlobeMethods } from 'react-globe.gl';
import { getRegisteredTooltipGroups } from '../pointTooltipRegistry';
import { claimGlobeClicks, isGlobeClick, pressOn, CLAIM_RANK, type PointerAt } from '../globeClick';
import { openGlobeNotes, type GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';
import { batchedLineAt } from '../../../geopolitical/geometry/lineBatches';
import { globeWorldToLatLng } from '../../../utils/globeCoordinates';
import type { LatLng } from '../../../features/globe/inspector/relatedMarks';

const HOVER_THROTTLE_MS = 60;
// Matches Enhanced3DGlobeInteractivity.tsx's own `movementSq < 4` skip-check.
const MOVEMENT_SKIP_THRESHOLD_SQ = 4;

/** World units — see the raycaster note below. */
const POINT_PICK_THRESHOLD_UNITS = 1.5;

/**
 * Screen pixels beyond a line's own half width that still pick it: an outline is drawn 1.25 px wide, and a pointer
 * has to land somewhere near it to name it.
 */
export const LINE_PICK_THRESHOLD_PX = 4;

/**
 * A fill or a line that answers a hover and a click (D-GV GV0.4): a batched line by the segment hit, its tooltip
 * and notes on its BatchedLine; a mesh, an area's fill, by its own `userData.tooltip` and `userData.opens`.
 * Null for anything else, InstancedMesh included, which keeps a record per instance.
 */
function shapeSay(intersection: THREE.Intersection): { tooltip?: string; opens?: GlobeNoteSet | null } | null {
  const line = batchedLineAt(intersection);
  if (line) return line;
  const obj = intersection.object;
  if ((obj as THREE.Mesh).isMesh && !(obj instanceof THREE.InstancedMesh)) {
    const say = obj.userData as { tooltip?: unknown; opens?: GlobeNoteSet | null } | undefined;
    if (typeof say?.tooltip === 'string') return { tooltip: say.tooltip, opens: say.opens ?? null };
  }
  return null;
}

/**
 * How near the pointer must come up to where the hover last read a mark's notes, in CSS pixels, for a click that
 * picks nothing there to open them (critique C5): at a mark's rim the hover read whole pixels and the click a pixel
 * further out, and a mark that said "Click to open" opened nothing.
 */
const CLICK_KEEPS_HOVER_PX = 3;

export interface HoveredPointTooltip {
  text: string;
  screenX: number;
  screenY: number;
  /** A click on this mark opens its notes (D-CT, CT3), and the hover says so. */
  opens?: boolean;
}

/**
 * Where a hit mark is (the inspector, A5): a point's own position, as drawn, not where the ray passed it; an area's
 * or a line's, the point the click landed on.
 */
export function hitPlace(hit: THREE.Intersection): LatLng {
  const obj = hit.object;
  if (obj instanceof THREE.Points && hit.index !== undefined && hit.index !== null) {
    const position = obj.geometry.getAttribute('position');
    if (position) return globeWorldToLatLng(new THREE.Vector3().fromBufferAttribute(position, hit.index).applyMatrix4(obj.matrixWorld));
  }
  return globeWorldToLatLng(hit.point);
}

/** The layer a hit mark is on, as it names itself: per point (`layers`), or for the whole object (`layer`). */
export function hitLayer(hit: THREE.Intersection): string | null {
  for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
    const data = o.userData as { layer?: unknown; layers?: unknown };
    if (o === hit.object && Array.isArray(data.layers) && typeof hit.index === 'number' && typeof data.layers[hit.index] === 'string') return data.layers[hit.index] as string;
    if (typeof data.layer === 'string' && data.layer) return data.layer;
  }
  return null;
}

/**
 * What a click on a mark opens, from the same hit its hover was read from (decision D-CT, CT3),
 * or null. A glyph layer hangs a GlobeNoteSet on each mark beside its tooltip, collected into
 * `userData.opens` in point order, as the tooltips are; a hover with nothing behind it opens nothing.
 */
export function resolvePointOpens(intersection: THREE.Intersection): GlobeNoteSet | null {
  const shape = shapeSay(intersection);
  if (shape) return shape.opens && Array.isArray(shape.opens.notes) && shape.opens.notes.length > 0 ? shape.opens : null;
  const obj = intersection.object;
  if (!(obj instanceof THREE.Points)) return null;
  const opens = (obj.userData as { opens?: Array<GlobeNoteSet | null> } | undefined)?.opens;
  const index = intersection.index;
  if (!Array.isArray(opens) || index === undefined || index === null) return null;
  const set = opens[index];
  return set && Array.isArray(set.notes) && set.notes.length > 0 ? set : null;
}

/**
 * Resolves a real tooltip string from a raycast hit, or null if the hit object is not
 * one of the layers that publish one — the base globe sphere, an Intel Report model, or
 * a layer that set no tooltips at all.
 *
 * TWO SHAPES, because the globe draws marks two ways:
 *
 *   · an InstancedMesh layer keeps a record per instance in userData.points, and a hit
 *     names the instance (weather grid, volcano catalogue, river gauges);
 *   · a screenPoints layer is ONE THREE.Points object whose tooltips are an array in
 *     the same order as its points, and a hit names the index (cyber threats, space
 *     weather, satellites, diplomacy, conflict).
 *
 * The second shape had no picking at all, which is how converting the space-weather
 * samples to screen points took away the hover label they had as react-globe.gl points
 * — pointLabel gives one for free, and nothing replaced it.
 *
 * And a third, for a field that covers the planet rather than marks on it (the
 * temperature heat map, decision D-W): the object keeps `userData.readAt`, which
 * reads the field at the point the ray met it.
 *
 * Exported for direct unit testing.
 */
export function resolveInstancedTooltip(intersection: THREE.Intersection): string | null {
  const obj = intersection.object;
  const readAt = (obj.userData as { readAt?: (point: THREE.Vector3) => string | null } | undefined)?.readAt;
  if (typeof readAt === 'function') return readAt(intersection.point);
  // A line or a fill with words of its own (GV0.4).
  const shape = shapeSay(intersection);
  if (shape) return shape.tooltip ?? null;
  if (obj instanceof THREE.Points) {
    const tooltips = (obj.userData as { tooltips?: string[] } | undefined)?.tooltips;
    const index = intersection.index;
    if (!tooltips || index === undefined || index === null) return null;
    return tooltips[index] ?? null;
  }
  if (!(obj instanceof THREE.InstancedMesh)) return null;
  const userData = obj.userData as { points?: Array<{ tooltip?: string }> } | undefined;
  const points = userData?.points;
  const instanceId = intersection.instanceId;
  if (!points || instanceId === undefined || instanceId === null) return null;
  return points[instanceId]?.tooltip ?? null;
}

/** Whether an object and every parent above it are shown. */
/** Whether a hit lies where its material's planes clip it away: side by side's other half (D-PW, PW73). */
export function clippedAt(hit: { object: THREE.Object3D; point: THREE.Vector3 }): boolean {
  const material = (hit.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  const planes = (Array.isArray(material) ? material[0] : material)?.clippingPlanes;
  return !!planes?.some((plane) => plane.distanceToPoint(hit.point) < 0);
}

export function isDrawn(object: THREE.Object3D): boolean {
  // Nor a mark faded all but away as the Earth shrinks on screen (block G, item 1).
  if (fadedOut(object)) return false;
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

interface UseGlobePointTooltipsOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useGlobePointTooltips({ globeRef, containerRef }: UseGlobePointTooltipsOptions): HoveredPointTooltip | null {
  const [tooltip, setTooltip] = useState<HoveredPointTooltip | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const lastCheckTimeRef = useRef(0);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  /** Whether the mark under the pointer opens anything: a nearer layer's claim, so the country under it does not open too. */
  const overOpensRef = useRef(false);
  /** Where the hover last read a mark's notes, and the notes, for a click at its rim. */
  const hoverOpensRef = useRef<{ x: number; y: number; opens: GlobeNoteSet; at: LatLng; layer: string | null } | null>(null);

  useEffect(() => claimGlobeClicks(() => ({ mark: overOpensRef.current, area: overOpensRef.current })), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const globeObj = () => globeRef.current as unknown as {
      scene: () => THREE.Scene; camera: () => THREE.Camera; renderer?: () => { domElement?: HTMLCanvasElement } | undefined;
    } | undefined;

    /** The tooltip, and what a click opens, of the nearest drawn mark at a point in the viewport, or null. */
    const pick = (clientX: number, clientY: number): { text: string; opens: GlobeNoteSet | null; at: LatLng | null; layer: string | null; groups: number; intersections: THREE.Intersection[] } | null => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const scene = globeObj()?.scene?.();
      const camera = globeObj()?.camera?.();
      if (!scene || !camera) return null;

      const groups = getRegisteredTooltipGroups().filter((g) => g.parent !== null);
      if (groups.length === 0) return null;

      mouseRef.current.x = (x / rect.width) * 2 - 1;
      mouseRef.current.y = -(y / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      /*
       * A screen-space point is drawn at a fixed pixel size, so its world radius grows
       * with distance; three.js measures the Points threshold in world units. This is
       * about a mark's own radius at the default view — close enough that the cursor
       * has to be on a mark, and forgiving enough to catch a small one.
       */
      raycasterRef.current.params.Points = { threshold: POINT_PICK_THRESHOLD_UNITS };
      // A batched line's slack, in screen pixels (LineSegments2 reads it there; its camera comes from setFromCamera).
      (raycasterRef.current.params as { Line2?: { threshold: number } }).Line2 = { threshold: LINE_PICK_THRESHOLD_PX };

      // three.js meets hidden objects too: only what is drawn may answer a hover. And it meets marks
      // through the Earth, beyond the horizon: only what the camera can see (pickRadius.ts).
      const intersections = visibleHits(
        raycasterRef.current.intersectObjects(groups, true).filter((hit) => isDrawn(hit.object) && !clippedAt(hit)),
        camera.position, GLOBE_RADIUS,
      );
      // The hover's text and the click's notes come from the same hit, so a click opens what the hover named.
      for (const hit of intersections) {
        const text = resolveInstancedTooltip(hit);
        if (text !== null) return { text, opens: resolvePointOpens(hit), at: hitPlace(hit), layer: hitLayer(hit), groups: groups.length, intersections };
      }
      return { text: '', opens: null, at: null, layer: null, groups: groups.length, intersections };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastCheckTimeRef.current < HOVER_THROTTLE_MS) return;
      lastCheckTimeRef.current = now;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const previous = lastPositionRef.current;
      const dx = previous ? x - previous.x : Infinity;
      const dy = previous ? y - previous.y : Infinity;
      if (previous && dx * dx + dy * dy < MOVEMENT_SKIP_THRESHOLD_SQ) return;
      lastPositionRef.current = { x, y };

      const hit = pick(event.clientX, event.clientY);
      overOpensRef.current = Boolean(hit?.opens);
      hoverOpensRef.current = hit?.opens && hit.at ? { x: event.clientX, y: event.clientY, opens: hit.opens, at: hit.at, layer: hit.layer } : null;

      if (hit && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        (window as unknown as { __pointTooltipDebug?: unknown }).__pointTooltipDebug = {
          getRegisteredGroupCount: () => hit.groups,
          getLastIntersectionCount: () => hit.intersections.length,
          getLastIntersectedTypes: () => hit.intersections.map((i) => (i.object as THREE.InstancedMesh).userData?.type ?? i.object.type),
          getLastRaw: () => ({
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            clientX: event.clientX,
            clientY: event.clientY,
            localX: x,
            localY: y,
            ndcX: mouseRef.current.x,
            ndcY: mouseRef.current.y,
          })
        };
      }

      setTooltip(hit && hit.text
        ? { text: hit.text, screenX: event.clientX, screenY: event.clientY, ...(hit.opens ? { opens: true } : {}) }
        : null);
    };

    /*
     * A click on a mark with notes behind it opens them (D-CT, CT3). The same three rules as
     * every layer's click (globeClick.ts): the pointer comes back up near where it went down,
     * both on the globe's canvas, with the primary button. Picked again where it came up, so a
     * tap with no hover before it opens what it landed on.
     */
    let pressed: PointerAt | null = null;
    const canvas = () => globeObj()?.renderer?.()?.domElement ?? null;
    const onDown = (e: PointerEvent) => { pressed = pressOn(e, canvas(), 'mark', CLAIM_RANK.nearest); };
    const onUp = (e: PointerEvent) => {
      const press = pressed;
      pressed = null;
      const at = canvas();
      if (!at || e.target !== at || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const hit = pick(e.clientX, e.clientY);
      // What the hover named, when the click comes up just past where the pick reaches: at a mark's rim (C5).
      const hovered = hoverOpensRef.current;
      const keepsHover = !hit?.text && hovered !== null
        && Math.hypot(e.clientX - hovered.x, e.clientY - hovered.y) <= CLICK_KEEPS_HOVER_PX;
      const opens = keepsHover ? hovered.opens : hit?.opens;
      const where = keepsHover ? { at: hovered.at, layer: hovered.layer } : { at: hit?.at ?? undefined, layer: hit?.layer ?? null };
      hoverOpensRef.current = null;
      // A click ends the hover: what it opens (a report's popup, a mark's notes, the place menu) is read
      // instead, and the tooltip stood over it until the popup closed (critique C7). The next move picks again.
      setTooltip(null);
      lastPositionRef.current = null;
      if (opens) openGlobeNotes(opens, where);
    };
    // Off the globe, nothing is hovered: the tooltip stayed over a popup or panel the pointer moved onto.
    const onLeave = () => { overOpensRef.current = false; hoverOpensRef.current = null; setTooltip(null); lastPositionRef.current = null; };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', onLeave);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      overOpensRef.current = false;
      hoverOpensRef.current = null;
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [globeRef, containerRef]);

  return tooltip;
}
