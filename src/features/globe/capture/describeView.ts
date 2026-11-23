/**
 * What is in the picture, counted (decision D-F, section 18, item 6).
 *
 * Mecha Jono asked for it so a caption can state facts about its image — "42
 * conflict events, 3 open missions" — and so an agent can decline to post an
 * empty globe without parsing caveats.
 *
 * What counts: a point mark a reader can hover, which is to say one carrying a
 * tooltip. That rule is not arbitrary. A bloom drawn behind a mark carries no
 * tooltip on purpose (the record, step 6.5), so it is not counted twice; and a
 * mark nobody can hover is not a thing a caption should name. Where a layer draws
 * the same labelled mark twice, the two are one item.
 *
 * Where: in front of the camera, not hidden by the planet, and inside the
 * crop a card is cut from (cropWithinFrame) — the same picture compose makes.
 *
 * Never: an RLSH entity. RLSH is people; it is not counted, named or ranked.
 */
import * as THREE from 'three';
import type { LayerLegend } from '../../../services/globe/globeLegendStore';
import { mentionsNamedTitle } from '../../../services/intel/namesPeople';

/** Layers never described, because what they draw is people. */
const NEVER_DESCRIBED = new Set(['RLSH']);

/** How many items each layer lists. The count covers them all. */
const MAX_ITEMS = 5;

export interface DescribedItem {
  label: string;
  /** On-screen size in CSS pixels, as drawn. */
  sizePx: number;
  /** The number the size encodes, when the layer states one. */
  magnitude?: number;
}

export interface DescribedLayer {
  layer: string;
  /** Distinct marks inside the picture. */
  inFrame: number;
  /** Distinct marks the layer draws anywhere on the globe. */
  drawn: number;
  /** Up to five of those in the picture, first first. */
  items: DescribedItem[];
  /** What decided the order. */
  rankedBy: string;
}

export interface ViewDescription {
  layers: DescribedLayer[];
  /** Drawn, keyed, and not countable as marks: lines and areas. */
  notCounted: string[];
}

export interface DescribeInput {
  scene: THREE.Object3D;
  camera: THREE.Camera;
  frame: { width: number; height: number };
  /** The part of the frame the card keeps. */
  crop: { x: number; y: number; width: number; height: number };
  legends: readonly LayerLegend[];
  /** The planet's radius in scene units, for what it hides. Default 100, react-globe.gl's. */
  globeRadius?: number;
}

/**
 * Whether the planet stands between the camera and a point.
 *
 * Not "is the point on the near hemisphere", which is right for a mark on the
 * surface and wrong for anything above it: a satellite beside the limb is below
 * its own horizon and in plain view. The segment from camera to point either
 * passes through the sphere before arriving, or it does not.
 */
function hiddenByPlanet(cameraAt: THREE.Vector3, point: THREE.Vector3, radius: number): boolean {
  const d = new THREE.Vector3().subVectors(point, cameraAt);
  const t = -cameraAt.dot(d) / d.lengthSq();
  if (t <= 0 || t >= 1) return false;
  const closest = cameraAt.clone().addScaledVector(d, t);
  return closest.length() < radius;
}

function visibleInTree(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function describeScene({ scene, camera, frame, crop, legends, globeRadius = 100 }: DescribeInput): ViewDescription {
  camera.updateMatrixWorld();
  const cameraAt = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const centre = { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };

  type Seen = { label: string; sizePx: number; magnitude: number | null; inFrame: boolean; distance: number };
  const byLayer = new Map<string, Map<string, Seen>>();

  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const points = object as THREE.Points;
    if (!points.isPoints || !visibleInTree(points)) return;
    const tooltips = points.userData?.tooltips as string[] | undefined;
    if (!Array.isArray(tooltips)) return;
    const position = points.geometry.getAttribute('position');
    const size = points.geometry.getAttribute('pointSize');
    const perPoint = points.userData?.layers as string[] | undefined;
    const magnitudes = points.userData?.magnitudes as Array<number | null> | undefined;
    const layerName = String(points.userData?.layer ?? points.userData?.type ?? 'unnamed');

    for (let i = 0; i < position.count; i++) {
      const layer = perPoint?.[i] ?? layerName;
      const label = tooltips[i];
      // Nor a mark whose words quote a note that names a person: a description an agent may print (D-NP, NP2).
      if (NEVER_DESCRIBED.has(layer) || !label || mentionsNamedTitle(label)) continue;

      const world = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(points.matrixWorld);
      const nearSide = !hiddenByPlanet(cameraAt, world, globeRadius);
      const ndc = world.clone().project(camera);
      const x = ((ndc.x + 1) / 2) * frame.width;
      const y = ((1 - ndc.y) / 2) * frame.height;
      const inFrame = nearSide && ndc.z >= -1 && ndc.z <= 1
        && x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;

      // One item per label at one place: a bloom and its mark answer alike.
      const key = `${label}|${Math.round(world.x)},${Math.round(world.y)},${Math.round(world.z)}`;
      const seen = byLayer.get(layer) ?? new Map<string, Seen>();
      byLayer.set(layer, seen);
      const sizePx = size ? size.getX(i) : 0;
      const prior = seen.get(key);
      const magnitude = typeof magnitudes?.[i] === 'number' ? magnitudes[i] as number : null;
      seen.set(key, {
        label,
        sizePx: Math.max(sizePx, prior?.sizePx ?? 0),
        magnitude: magnitude ?? prior?.magnitude ?? null,
        inFrame: inFrame || (prior?.inFrame ?? false),
        distance: Math.hypot(x - centre.x, y - centre.y),
      });
    }
  });

  const layers: DescribedLayer[] = [...byLayer.entries()].map(([layer, seen]) => {
    const all = [...seen.values()];
    const inside = all.filter((s) => s.inFrame);
    const sizeMeans = legends.find((l) => l.layer === layer)?.sizeMeans;
    // By the value the size stands for when the layer states it, then by pixels:
    // sizes are capped, and at the cap a large and a very large country draw alike.
    const byValue = (a: Seen, b: Seen) => (b.magnitude ?? -Infinity) - (a.magnitude ?? -Infinity);
    const ordered = sizeMeans
      ? [...inside].sort((a, b) => byValue(a, b) || b.sizePx - a.sizePx || a.distance - b.distance)
      : [...inside].sort((a, b) => a.distance - b.distance);
    return {
      layer,
      inFrame: inside.length,
      drawn: all.length,
      items: ordered.slice(0, MAX_ITEMS).map(({ label, sizePx, magnitude }) => ({
        label, sizePx, ...(magnitude !== null ? { magnitude } : {}),
      })),
      rankedBy: sizeMeans ? `size: ${sizeMeans}` : 'nearest the centre of the picture',
    };
  });

  const counted = new Set(layers.map((l) => l.layer));
  const notCounted = [...new Set(legends.map((l) => l.layer))]
    .filter((name) => !counted.has(name) && !NEVER_DESCRIBED.has(name));

  return { layers, notCounted };
}

/**
 * Where each mark in the picture is, in the frame's pixels: what a close-up
 * inset keeps clear of (IM35). The marks describeScene counts, through the same
 * camera: hoverable, on the near side, inside the crop, and never RLSH's.
 */
export function markPositions({ scene, camera, frame, crop, globeRadius = 100 }: Omit<DescribeInput, 'legends'>): Array<{ x: number; y: number }> {
  camera.updateMatrixWorld();
  const cameraAt = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const out: Array<{ x: number; y: number }> = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const points = object as THREE.Points;
    if (!points.isPoints || !visibleInTree(points)) return;
    const tooltips = points.userData?.tooltips as string[] | undefined;
    if (!Array.isArray(tooltips)) return;
    const position = points.geometry.getAttribute('position');
    const perPoint = points.userData?.layers as string[] | undefined;
    const layerName = String(points.userData?.layer ?? points.userData?.type ?? 'unnamed');
    for (let i = 0; i < position.count; i++) {
      if (NEVER_DESCRIBED.has(perPoint?.[i] ?? layerName) || !tooltips[i]) continue;
      const world = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(points.matrixWorld);
      if (hiddenByPlanet(cameraAt, world, globeRadius)) continue;
      const ndc = world.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1) continue;
      const x = ((ndc.x + 1) / 2) * frame.width;
      const y = ((1 - ndc.y) / 2) * frame.height;
      if (x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height) out.push({ x, y });
    }
  });
  return out;
}

/** Shapes drawn as lines or areas, hatched areas and arcs too: not marks, so nothing here counts them. */
const UNMEASURED_SHAPES = new Set(['area', 'line', 'dashed', 'hatch', 'arc']);

/**
 * The layers a card's key names (decision IM12): each with marks inside the
 * picture, and each drawing what describeScene cannot count — lines and areas.
 * A layer that draws both, as War & Conflict draws its items and its war map,
 * is keyed whenever it declares an area or a line, marks in the picture or not:
 * its fills can be in the picture when none of its marks is, and a key that
 * misses a colour on the picture is worse than one naming a colour it lacks.
 */
export function keyedLayers(described: ViewDescription, legends: readonly LayerLegend[]): string[] {
  const drawsUnmeasured = (layer: string) => legends.some((entry) => entry.layer === layer
    && entry.swatches.some((swatch) => UNMEASURED_SHAPES.has(swatch.shape ?? '')));
  return [...new Set([
    ...described.layers.filter((l) => l.inFrame > 0 || drawsUnmeasured(l.layer)).map((l) => l.layer),
    ...described.notCounted,
  ])];
}
