/**
 * Every mark rides on the territories' raised shell (decision K5, TS1:
 * docs/missions/01-architecture-decisions/territories.md).
 *
 * Classic stands the country fills at 3.5 units, 223 km up, as the old look did.
 * Standing them there alone is what d166d5bb undid: the shell covered every mark
 * under it. So while the shell is raised, every layer drawn above the base map
 * rises with it, by one uniform scale about the Earth's centre:
 *
 *   lift = (100 + the shell's height) / (100 × BASE_MAP)
 *
 * which puts the base map's band exactly on the shell and keeps every band above
 * it in its order and its gaps. Ground fields (temperature, rain, wind, clouds)
 * stay under the shell, tinted by it; the sky (satellites, the magnetosphere, the
 * solar system) is a physical distance and never moves.
 *
 * ─── HOW A LAYER RIDES ─────────────────────────────────────────────────────
 *
 * Its root, a direct child of the scene at the origin with its children in globe
 * coordinates, is marked with ridesShell(), and liftRiders() sets that root's
 * scale at the start of each render. In place: never by moving the root into a
 * lifted parent, since the layers find and remove their roots as the scene's own
 * children (scene.remove, scene.children.includes), and a root moved elsewhere is
 * put straight back or never removed. The lift is set on every render, not only
 * when it changes, so a root a layer replaces (the aurora, every data refresh)
 * rises the moment it is drawn. A root with a position of its own cannot ride this
 * way; it reads shellLift() instead (the cursor).
 *
 * A capture draws its own style (globe-engine/territoryLook.ts), Quiet unless the
 * shot names one, so the lift is decided per render, by the territories layer,
 * from the style that render draws.
 */
import * as THREE from 'three';
import { BASE_MAP } from '../components/Globe/globeAltitudes';

const GLOBE_RADIUS_UNITS = 100;

/*
 * ─── DRAW ORDER: HEIGHT ALONE DOES NOT PUT A MARK OVER THE SHELL ───────────
 *
 * The fills write no depth, so whether a see-through mark shows over them is
 * decided by draw order, and three.js sorts see-through objects by the order of
 * their nearest enclosing Group first. The fills' group draws at 95, after every
 * layer whose group is at 0, which is most of them (the war map's fills, the lit
 * areas, GDACS's polygons, the plumes, the cursor's tail): a raised shell would
 * paint over them however high they rode. So while the shell is raised its group
 * draws early, at RAISED_SHELL_ORDER, after the ground fields' groups
 * (GROUND_FIELD_ORDER), which it covers and tints, and before everything at 0 or
 * above, which it carries. On the ground it keeps 95, so Quiet draws as it always
 * has.
 */
export const GROUND_FIELD_ORDER = -2;
export const RAISED_SHELL_ORDER = -1;

/** Marks a ground field's root to draw with the ground fields, before a raised shell. Returns it. */
export function groundField<T extends THREE.Object3D>(root: T): T {
  root.renderOrder = GROUND_FIELD_ORDER;
  return root;
}

/** The scale that puts the base map's band on a shell `height` units up: never below 1. */
export function liftForHeight(height: number): number {
  if (!Number.isFinite(height)) return 1;
  return Math.max(1, (GLOBE_RADIUS_UNITS + height) / (GLOBE_RADIUS_UNITS * BASE_MAP));
}

/** Marks a layer's root to rise with the shell. Returns it, so a root can be made and marked in one line. */
export function ridesShell<T extends THREE.Object3D>(root: T): T {
  root.userData.ridesShell = true;
  return root;
}

export function isShellRider(object: THREE.Object3D | null | undefined): boolean {
  return object?.userData?.ridesShell === true;
}

/*
 * three-globe's own layers, drawn from react-globe.gl's props (arcsData,
 * ringsData), sit inside its root beside the Earth itself, so they cannot be
 * marked where they are made. three-globe adds one group per layer, in a fixed
 * order (three-globe 2.44, `layers` in dist/three-globe.mjs, pinned by
 * shellLift.test.ts), so a layer's group is found by its place, and checked by
 * what it holds before it is moved.
 */
const THREE_GLOBE_LAYER_INDEX = { arcs: 2, rings: 10 } as const;
const THREE_GLOBE_DATUM_TYPE = { arcs: 'arc', rings: 'ring' } as const;

type GlobeObjectTyped = THREE.Object3D & { __globeObjType?: string };

const rootByScene = new WeakMap<THREE.Scene, THREE.Object3D>();

/**
 * three-globe's root in the scene: the object whose children include its Earth
 * ('globe'). Found once per scene and kept while it stays there, since this runs at
 * every render and the search walks every layer's children.
 */
function threeGlobeRoot(scene: THREE.Scene): THREE.Object3D | null {
  const kept = rootByScene.get(scene);
  if (kept && kept.parent === scene) return kept;
  for (const child of scene.children) {
    if (isShellRider(child)) continue;
    if (child.children.some((g) => g.children.some((o) => (o as GlobeObjectTyped).__globeObjType === 'globe'))) {
      rootByScene.set(scene, child);
      return child;
    }
  }
  return null;
}

/** three-globe's group for a layer, or null where its place holds anything else. */
export function threeGlobeLayerGroup(scene: THREE.Scene, layer: keyof typeof THREE_GLOBE_LAYER_INDEX): THREE.Object3D | null {
  const group = threeGlobeRoot(scene)?.children[THREE_GLOBE_LAYER_INDEX[layer]];
  if (!group) return null;
  const wanted = THREE_GLOBE_DATUM_TYPE[layer];
  return group.children.every((o) => (o as GlobeObjectTyped).__globeObjType === wanted) ? group : null;
}

let current = 1;

/**
 * Sets every rider's scale to `lift`: the scene's marked roots, and three-globe's
 * arcs and rings. Called at the start of each render by the territories layer, and
 * with 1 when it is switched off.
 */
export function liftRiders(scene: THREE.Scene, lift: number): void {
  current = lift;
  const set = (object: THREE.Object3D) => {
    if (object.scale.x === lift) return;
    object.scale.setScalar(lift);
    // Now, for this render: three.js updates the scene's world matrices before the
    // scene's onBeforeRender, where this runs, so a scale left to the next update
    // reached the next frame instead. A Quiet card drawn after a Classic frame drew
    // every mark still lifted.
    object.updateMatrixWorld(true);
  };
  for (const child of scene.children) if (isShellRider(child)) set(child);
  for (const layer of ['arcs', 'rings'] as const) {
    const group = threeGlobeLayerGroup(scene, layer);
    if (group) set(group);
  }
}

/**
 * Runs `read` with every rider at `lift`, then puts them back. For what reads the
 * scene's positions outside a render, as a card's composition does after its frame
 * is captured: by then a live frame may have lifted the riders again, and a card
 * drawn Quiet would place its inset and count its marks where the screen's Classic
 * put them.
 */
export function readAtLift<T>(scene: THREE.Scene, lift: number, read: () => T): T {
  // Nothing raised and nothing asked for: every rider, a new one too, is already at 1.
  if (lift === 1 && current === 1) return read();
  const before = current;
  liftRiders(scene, lift);
  try {
    return read();
  } finally {
    liftRiders(scene, before);
  }
}

/** The lift the last render drew: 1 unless the shell is raised. For what places itself (the cursor, picks). */
export function shellLift(): number {
  return current;
}

/**
 * The ground point beneath what a pointer's ray sees: where the ray meets a raised
 * shell, brought down along that line to the ground hit's radius. The ground hit
 * itself when nothing is raised. Read as a place, it is the place drawn under the
 * pointer; the ground hit is up to 3.5·tan θ units off it, some 390 km at 60° from
 * straight down, which put a click and a hover on the next country over.
 */
export function groundUnderShell(ray: THREE.Ray, groundHit: THREE.Vector3): THREE.Vector3 {
  if (current <= 1) return groundHit;
  const radius = groundHit.length();
  const onShell = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), radius * current), new THREE.Vector3());
  return onShell ? onShell.setLength(radius) : groundHit;
}

/** Back to a first visit's state. */
export function resetShellLiftForTest(): void {
  current = 1;
}
