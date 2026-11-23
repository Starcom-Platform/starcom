/**
 * Two layers side by side (D-CM, CM1): the left half of the globe draws one layer, the right half another, every other
 * thing in both. The frame is drawn twice, each time in its own half (a scissor) with the other layer's objects
 * hidden, so it holds whatever a layer's shaders are; clipping planes, which Psi Watch's split uses, are ignored by
 * the custom shaders most marks draw with. A card or a clip frame drawn through the same render has both halves too
 * (CM3).
 *
 * A layer takes part by naming its objects (registerLayerRoot): only a layer that has may be compared, so nothing
 * offers a split that cannot be drawn apart. While the Sun's glow draws (into a render target), the frame is drawn
 * whole.
 */
import * as THREE from 'three';
import { useEffect, useSyncExternalStore } from 'react';

/** A comparison of one layer at two moments (D-CM, CM4): the layer, and how its other moment is chosen. */
export type MomentPick =
  /** The same window this much earlier, in the right half. */
  | { earlier: '1w' | '1mo' | '1y' | '10y' }
  /** This window held in the left half; the time bar's, wherever it is paused, in the right. */
  | { held: { from: number; until: number } }
  /** So many hours ahead, a forecast, in the right half (CM5): Earth Weather. */
  | { ahead: number };

export interface Comparison {
  /** The layer drawn in the left half, and the one in the right, by their layer ids. */
  left: string;
  right: string;
  /** One layer at two moments (CM1, CM4): one half is its other moment's own copy, `<layer>@then`. */
  moment?: { layer: string; pick: MomentPick };
  /** Each half's name, where the layer's alone does not say it: a moment comparison names its windows. */
  labels?: { left: string; right: string };
}

/** The id the other moment's copy of a layer takes part under. */
export const thenOf = (layer: string): string => `${layer}@then`;
/** A copy at another moment is never offered as a layer of its own. */
export const isThen = (layer: string): boolean => layer.endsWith('@then');

// ── The objects each layer draws ─────────────────────────────────────────────
const roots = new Map<string, Set<THREE.Object3D>>();
const rootListeners = new Set<() => void>();
/** The comparable layers' ids, sorted and joined: one string, the same until the set changes. */
let comparableKey = '';
const tellRoots = () => {
  const next = [...roots.keys()].filter((layer) => !isThen(layer)).sort().join(',');
  if (next === comparableKey) return;
  comparableKey = next;
  rootListeners.forEach((l) => l());
};

/** Objects that are the same at every moment (the plates, the volcano catalogue): both halves of a moment comparison. */
const timeless = new WeakSet<THREE.Object3D>();

/** Names an object as one of a layer's while it stands; returns how to take it back. */
export function registerLayerRoot(layer: string, object: THREE.Object3D, options: { timeless?: boolean } = {}): () => void {
  const set = roots.get(layer) ?? new Set<THREE.Object3D>();
  set.add(object);
  if (options.timeless) timeless.add(object);
  roots.set(layer, set);
  tellRoots();
  return () => {
    set.delete(object);
    if (!set.size) roots.delete(layer);
    tellRoots();
  };
}

/** A hook's object named as one of a layer's for as long as the hook is mounted (null names nothing). */
export function useLayerRoot(layer: string, object: THREE.Object3D | null | undefined, options: { timeless?: boolean } = {}): void {
  const isTimeless = options.timeless === true;
  useEffect(() => (object ? registerLayerRoot(layer, object, { timeless: isTimeless }) : undefined), [layer, object, isTimeless]);
}

export function layerRoots(layer: string): ReadonlySet<THREE.Object3D> {
  return roots.get(layer) ?? new Set();
}

/**
 * Objects of a layer found as each half is drawn, for those another library makes afresh (three-globe's arcs, one
 * object each, rebuilt whenever the arcs change). A finder alone never makes a layer comparable: its named roots do.
 */
const finders = new Map<string, Set<() => Iterable<THREE.Object3D>>>();

export function registerLayerFinder(layer: string, find: () => Iterable<THREE.Object3D>): () => void {
  const set = finders.get(layer) ?? new Set<() => Iterable<THREE.Object3D>>();
  set.add(find);
  finders.set(layer, set);
  return () => {
    set.delete(find);
    if (!set.size) finders.delete(layer);
  };
}

/** The layers that can be compared: those that have named their objects (never another moment's copy). */
export function comparableLayers(): string[] {
  return [...roots.keys()].filter((layer) => !isThen(layer));
}

/** The comparable layers' ids, joined by commas, for a render that offers them. */
export function useComparableLayers(): string {
  return useSyncExternalStore(
    (l) => { rootListeners.add(l); return () => { rootListeners.delete(l); }; },
    () => comparableKey,
    () => '',
  );
}

// ── The comparison chosen ────────────────────────────────────────────────────
let comparison: Comparison | null = null;
const listeners = new Set<() => void>();

export function setComparison(next: Comparison | null): void {
  comparison = next && next.left !== next.right ? { ...next } : null;
  listeners.forEach((l) => l());
}

/** Each half's name, as the windows it shows move (a moment comparison's); unchanged words tell no one. */
export function setComparisonLabels(labels: { left: string; right: string } | undefined): void {
  if (!comparison) return;
  if (comparison.labels?.left === labels?.left && comparison.labels?.right === labels?.right) return;
  comparison = { ...comparison, ...(labels ? { labels } : {}) };
  if (!labels) delete comparison.labels;
  listeners.forEach((l) => l());
}

export function currentComparison(): Comparison | null {
  return comparison;
}

export function subscribeComparison(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useComparison(): Comparison | null {
  return useSyncExternalStore(subscribeComparison, currentComparison, () => null);
}

// ── Starting and ending one ──────────────────────────────────────────────────
/** What a comparison needs of the layer control: both its layers drawn, one pinned beside the other where it is not. */
export interface ComparePins {
  isLayerActive: (layer: string) => boolean;
  pinLayer: (layer: string) => void;
  unpinLayer: (layer: string) => void;
}
/** The layers a comparison pinned to draw them: let go when it ends, and those alone. */
let pinnedForComparison: string[] = [];

/** Starts a comparison, pinning either layer not drawn; one already running is ended first. */
export function beginComparison(next: Comparison, pins: ComparePins): void {
  if (comparison) endComparison(pins);
  if (next.left === next.right) return;
  // Another moment's copy is drawn by its layer's own hooks: only a layer itself is pinned.
  pinnedForComparison = [next.left, next.right].filter((layer) => !isThen(layer) && !pins.isLayerActive(layer));
  pinnedForComparison.forEach((layer) => pins.pinLayer(layer));
  setComparison(next);
}

/** One layer at two moments (CM4): earlier in the right half; a held window in the left, the time bar's in the right. */
export function momentComparison(layer: string, pick: MomentPick): Comparison {
  return 'held' in pick
    ? { left: thenOf(layer), right: layer, moment: { layer, pick } }
    : { left: layer, right: thenOf(layer), moment: { layer, pick } };
}

/** Ends the comparison, letting go of what it pinned. */
export function endComparison(pins: ComparePins | null): void {
  if (pins) pinnedForComparison.forEach((layer) => pins.unpinLayer(layer));
  pinnedForComparison = [];
  setComparison(null);
}

// ── Drawing it ───────────────────────────────────────────────────────────────
/** Hides a layer's objects for one pass, giving back what each was; at two moments, the timeless ones stay. */
function hide(layer: string, keepTimeless: boolean): () => void {
  const was: Array<[THREE.Object3D, boolean]> = [];
  const found = [...(finders.get(layer) ?? [])].flatMap((find) => [...find()]);
  for (const object of [...layerRoots(layer), ...found]) {
    if (keepTimeless && timeless.has(object)) continue;
    was.push([object, object.visible]);
    object.visible = false;
  }
  return () => { for (const [object, visible] of was) object.visible = visible; };
}

/**
 * Where the halves meet in a render `width` wide: the screen's middle, wherever the render's window is. A card draws a
 * window of the screen's view (a camera view offset), so its middle is not the screen's; a window wholly to one side
 * is all of that half.
 */
export function splitAt(camera: THREE.Camera, width: number): number {
  const view = (camera as THREE.PerspectiveCamera).view;
  const at = view?.enabled && view.width > 0 ? ((view.fullWidth / 2 - view.offsetX) / view.width) * width : width / 2;
  return Math.round(Math.min(width, Math.max(0, at)));
}

/**
 * While a comparison is chosen, every render of `scene` to the screen is two: the left half without the right layer,
 * the right half without the left. Returns how to stop.
 */
export function installComparison(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const original = renderer.render;
  const size = new THREE.Vector2();
  let inside = false;
  renderer.render = function compared(drawn: THREE.Object3D, camera: THREE.Camera) {
    const chosen = comparison;
    // Another scene, a pass of its own, or a target (the Sun's glow): drawn as it was.
    if (!chosen || drawn !== scene || inside || renderer.getRenderTarget() !== null) {
      return original.call(this, drawn, camera);
    }
    inside = true;
    const scissoring = renderer.getScissorTest();
    try {
      renderer.getSize(size);
      const half = splitAt(camera, size.x);
      renderer.setScissorTest(true);
      // A clear keeps to the scissor, so each pass clears its own half; a half with no width is not drawn.
      if (half > 0) {
        renderer.setScissor(0, 0, half, size.y);
        const showRight = hide(chosen.right, !!chosen.moment);
        try { original.call(this, drawn, camera); } finally { showRight(); }
      }
      if (half < size.x) {
        renderer.setScissor(half, 0, size.x - half, size.y);
        const showLeft = hide(chosen.left, !!chosen.moment);
        try { original.call(this, drawn, camera); } finally { showLeft(); }
      }
    } finally {
      renderer.setScissor(0, 0, size.x, size.y);
      renderer.setScissorTest(scissoring);
      inside = false;
    }
  } as typeof renderer.render;
  return () => { renderer.render = original; };
}

export function resetComparisonForTests(): void {
  roots.clear();
  finders.clear();
  comparison = null;
  comparableKey = '';
  pinnedForComparison = [];
}
