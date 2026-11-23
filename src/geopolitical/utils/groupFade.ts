// groupFade.ts — opacity fade-in / fade-out-then-dispose for THREE.Group
// content, generalizing the old territories-only fadeInTerritoryMeshes into
// something reusable for borders/maritime/territories alike, and (unlike the
// old function) able to fade OLD content OUT instead of only fading new
// content in. `clearGroup` (disposal.ts) disposes synchronously on removal,
// so there was previously no way to keep a mesh visible while it fades —
// fadeGroupOutThenDispose exists specifically to fill that gap for a real
// LOD cross-fade (see useNationalTerritories3D.ts's replaceGroupContentsWithCrossFade).
import * as THREE from 'three';
import { disposeObject3D } from './disposal';
import { isShellRider, ridesShell } from '../../globe-engine/shellLift';
import { isTerritoryFillMaterial, setTerritoryMaterialOpacity, getTerritoryMaterialOpacity } from '../theme/territoryFillMaterial';
import {
  isScreenPointsMaterial, getScreenPointsMaterialOpacity, setScreenPointsMaterialOpacity,
} from '../../components/Globe/screenPoints';

const easeInOutCubic = (value: number) => (value < 0.5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2);

type OpacityCapableMaterial = THREE.Material & { opacity: number };

function hasOpacity(material: THREE.Material): material is OpacityCapableMaterial {
  return typeof (material as OpacityCapableMaterial).opacity === 'number';
}

// Territory fill materials drive opacity through a uniform (see
// territoryFillMaterial.ts) rather than the plain `.opacity` property every
// other material here uses (LineBasicMaterial today; LineMaterial from
// examples/jsm/lines exposes `.opacity` as a getter/setter over its own
// uniform too, so it needs no special case).
function getMaterialOpacity(material: THREE.Material): number | null {
  if (isTerritoryFillMaterial(material)) return getTerritoryMaterialOpacity(material);
  // Screen-point marks, same reason: opacity is a uniform. A ShaderMaterial DOES carry
  // a `.opacity` property, which this shader ignores — so without this case a fade
  // wrote to it, changed nothing on screen, and reported success.
  if (isScreenPointsMaterial(material)) return getScreenPointsMaterialOpacity(material);
  if (hasOpacity(material)) return material.opacity;
  return null;
}

function setMaterialOpacity(material: THREE.Material, opacity: number): void {
  if (isTerritoryFillMaterial(material)) { setTerritoryMaterialOpacity(material, opacity); return; }
  if (isScreenPointsMaterial(material)) { setScreenPointsMaterialOpacity(material, opacity); return; }
  if (hasOpacity(material)) material.opacity = opacity;
}

function forEachMeshOrLineMaterial(group: THREE.Group, fn: (material: THREE.Material) => void): void {
  group.traverse((obj) => {
    const material = (obj as THREE.Mesh | THREE.Line | THREE.Points).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    (Array.isArray(material) ? material : [material]).forEach(fn);
  });
}

/**
 * Fades every mesh/line material's opacity in `group` up from 0 to whatever
 * opacity it already has when this is called — NOT a single opacity passed
 * in by the caller. That matters for borders specifically: each line's final
 * opacity is set per-classification (see resolveBorderMaterialConfig — e.g.
 * disputed/line_of_control get a +0.1 boost over international), already
 * baked into its material by buildBorders/buildMaritimeBorders before this
 * runs. A single uniform target would flatten that differentiation. Each
 * material's own current value is captured as its individual fade target,
 * then forced to 0 and eased back up to it. `reducedMotion` snaps directly.
 */
export function fadeGroupIn(group: THREE.Group, durationMs = 500, reducedMotion = false): void {
  const targets = new Map<THREE.Material, number>();
  forEachMeshOrLineMaterial(group, (m) => {
    const opacity = getMaterialOpacity(m);
    if (opacity !== null) { targets.set(m, opacity); setMaterialOpacity(m, 0); }
  });
  if (targets.size === 0) return;

  if (reducedMotion || durationMs <= 0) {
    targets.forEach((target, m) => setMaterialOpacity(m, target));
    return;
  }

  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeInOutCubic(t);
    targets.forEach((target, m) => setMaterialOpacity(m, target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface FadeHandle {
  /** Force-completes immediately: disposes the group's contents and invokes onComplete, if not already done. */
  cancel: () => void;
}

/**
 * Fades every mesh/line material's opacity in `group` down to 0, then
 * disposes every child's geometry/material and calls `onComplete` (typically
 * `parent.remove(group)`). Returns a handle whose `cancel()` skips straight
 * to that end state — used to force-clean an in-flight fade if the whole
 * layer is disabled or unmounted before the animation would naturally finish,
 * so it can't outlive its owner.
 */
export function fadeGroupOutThenDispose(group: THREE.Group, durationMs: number, reducedMotion: boolean, onComplete: () => void): FadeHandle {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    group.traverse((obj) => disposeObject3D(obj));
    onComplete();
  };

  if (reducedMotion || durationMs <= 0) {
    finish();
    return { cancel: () => {} };
  }

  const startOpacities = new Map<THREE.Material, number>();
  forEachMeshOrLineMaterial(group, (m) => {
    const opacity = getMaterialOpacity(m);
    if (opacity !== null) startOpacities.set(m, opacity);
  });

  const start = performance.now();
  const tick = (now: number) => {
    if (done) return;
    const t = Math.min(1, (now - start) / durationMs);
    const factor = 1 - easeInOutCubic(t);
    startOpacities.forEach((startOpacity, material) => setMaterialOpacity(material, startOpacity * factor));
    if (t < 1) requestAnimationFrame(tick);
    else finish();
  };
  requestAnimationFrame(tick);

  return { cancel: finish };
}

/**
 * Replaces `current`'s contents with `newContent`'s, cross-fading instead of
 * the old clearGroup()-then-add() instant swap (clearGroup disposes
 * synchronously, so there was no way to keep the old content visible while it
 * faded). `current`'s own identity is never replaced — callers that register
 * `current` once with a persistent registry (see globalLayerRegistry usage in
 * useNationalTerritories3D.ts, which locks onto the exact group reference the
 * first time a layer is built) can keep doing so safely.
 *
 * How: `current`'s existing children are moved into a new, temporary sibling
 * group (added to the same parent, with the same transform via
 * `applyTransform`) that fades out and disposes itself independently.
 * `newContent`'s children are moved into `current` *synchronously*, in the
 * same call — so raycasting/hover/selection (which all read `current`
 * directly) target the new content immediately; only the old content's
 * *visual* removal is gradual. The fading-out sibling is never a child of
 * `current`, so it's automatically excluded from anything that raycasts
 * against `current.children` — no separate isolation step needed.
 *
 * Returns the fade-out handle (null if there was nothing to fade from, e.g.
 * the very first build) so the caller can cancel it — e.g. on unmount/disable
 * — rather than letting it finish on its own schedule after its owner is gone.
 */
export function replaceGroupContentsWithCrossFade(
  current: THREE.Group,
  newContent: THREE.Group,
  opts: { durationMs?: number; reducedMotion?: boolean; applyTransform?: (group: THREE.Group) => void }
): FadeHandle | null {
  const durationMs = opts.durationMs ?? 500;
  const reducedMotion = opts.reducedMotion ?? false;
  const parent = current.parent;

  let fadeOutHandle: FadeHandle | null = null;
  if (parent && current.children.length > 0) {
    const fadingOut = new THREE.Group();
    // The outgoing content fades where it stood: at the holder's scale (the fills'
    // height, a rider's lift), in its place in the draw order, and riding the shell
    // if the holder does (globe-engine/shellLift.ts). A bare group dropped it to the
    // bake's own radius, and under a raised shell, for the length of the fade.
    fadingOut.scale.copy(current.scale);
    fadingOut.renderOrder = current.renderOrder;
    if (isShellRider(current)) ridesShell(fadingOut);
    opts.applyTransform?.(fadingOut);
    fadingOut.add(...current.children); // guarded non-empty by the check above
    parent.add(fadingOut);
    fadeOutHandle = fadeGroupOutThenDispose(fadingOut, durationMs, reducedMotion, () => {
      parent.remove(fadingOut);
    });
  }

  // .add(...[]) (zero arguments) logs a console.error in three.js — guard it,
  // since an empty newContent is a legitimate case (e.g. a maritime layer
  // with no features for this LOD).
  if (newContent.children.length > 0) current.add(...newContent.children);
  fadeGroupIn(current, durationMs, reducedMotion);
  return fadeOutHandle;
}
