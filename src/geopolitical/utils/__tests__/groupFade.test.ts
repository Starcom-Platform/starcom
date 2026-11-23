import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { fadeGroupIn, fadeGroupOutThenDispose, replaceGroupContentsWithCrossFade } from '../groupFade';
import { createTerritoryFillMaterial } from '../../theme/territoryFillMaterial';
import { buildScreenPoints } from '../../../components/Globe/screenPoints';

// Same rAF-mocking pattern used elsewhere in this codebase (see
// src/solar-system/__tests__/ScaleTransitionEngine.test.ts) — capture
// scheduled callbacks and invoke them manually with controlled timestamps
// instead of relying on real frame timing.
let frameCallbacks: Array<(time: number) => void>;

// The SUT reads a real performance.now() as its fade-start timestamp, so
// frame timestamps here must be relative to "now", not an absolute small
// number — otherwise (now - start) goes negative and the eased t is garbage.
function runFrames(count: number, elapsedMs: number) {
  const time = performance.now() + elapsedMs;
  for (let i = 0; i < count && frameCallbacks.length > 0; i++) {
    const cb = frameCallbacks.shift();
    cb?.(time);
  }
}

function makeLineMesh(): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  return new THREE.Line(geom, mat);
}

function makeScreenPoints(opacity: number): THREE.Points {
  return buildScreenPoints(
    [{ position: new THREE.Vector3(0, 0, 100), sizePx: 8, color: 0x8a7a6a }],
    { opacity },
  );
}

function makeTerritoryMesh(): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geom.setIndex([0, 1, 2]);
  const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
  return new THREE.Mesh(geom, mat);
}

describe('groupFade', () => {
  beforeEach(() => {
    frameCallbacks = [];
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      frameCallbacks.push(cb as (time: number) => void);
      return frameCallbacks.length;
    });
  });

  describe('fadeGroupIn', () => {
    it('captures each material\'s own current opacity as its fade target (not a single uniform value), forces it to 0, then eases back up to it', () => {
      // Distinct opacities per material, mimicking real per-classification
      // border opacity — a single shared target would flatten this.
      const line = makeLineMesh(); // opacity 0.8
      const territory = makeTerritoryMesh(); // opacity 0.4
      const group = new THREE.Group();
      group.add(line);
      group.add(territory);

      fadeGroupIn(group, 500);

      const territoryMat = territory.material as THREE.ShaderMaterial;
      expect((line.material as THREE.LineBasicMaterial).opacity).toBe(0);
      expect(territoryMat.uniforms.uOpacity.value).toBe(0);

      runFrames(1, 500); // t = 1.0 (full duration elapsed)
      expect((line.material as THREE.LineBasicMaterial).opacity).toBeCloseTo(0.8, 5);
      expect(territoryMat.uniforms.uOpacity.value).toBeCloseTo(0.4, 5);
    });

    it('snaps directly to each material\'s own target opacity when reducedMotion is set, scheduling no frames', () => {
      const group = new THREE.Group();
      group.add(makeLineMesh()); // opacity 0.8

      fadeGroupIn(group, 500, true);

      expect(frameCallbacks.length).toBe(0);
      expect((group.children[0] as THREE.Line).material as THREE.LineBasicMaterial).toHaveProperty('opacity', 0.8);
    });
  });

  describe('fadeGroupOutThenDispose', () => {
    it('eases opacity toward 0, then disposes children and calls onComplete exactly once', () => {
      const group = new THREE.Group();
      const line = makeLineMesh();
      group.add(line);
      const disposeSpy = vi.spyOn(line.geometry, 'dispose');
      const onComplete = vi.fn();

      fadeGroupOutThenDispose(group, 500, false, onComplete);
      expect(onComplete).not.toHaveBeenCalled();
      expect(disposeSpy).not.toHaveBeenCalled();

      runFrames(1, 500); // reach t = 1.0 in one jump, completes on this tick
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('cancel() force-completes immediately and a subsequent natural tick does not double-dispose or double-complete', () => {
      const group = new THREE.Group();
      const line = makeLineMesh();
      group.add(line);
      const disposeSpy = vi.spyOn(line.geometry, 'dispose');
      const onComplete = vi.fn();

      const handle = fadeGroupOutThenDispose(group, 500, false, onComplete);
      const pendingTick = frameCallbacks[0];

      handle.cancel();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(disposeSpy).toHaveBeenCalledTimes(1);

      // The rAF callback scheduled before cancel() still fires (nothing
      // cancels the browser-level rAF registration) — it must be a no-op.
      pendingTick(1000);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('finishes synchronously with no scheduled frames when reducedMotion is set', () => {
      const group = new THREE.Group();
      group.add(makeLineMesh());
      const onComplete = vi.fn();

      fadeGroupOutThenDispose(group, 500, true, onComplete);

      expect(frameCallbacks.length).toBe(0);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('replaceGroupContentsWithCrossFade', () => {
    it('swaps children into `current` synchronously (interaction targets the new content immediately)', () => {
      const scene = new THREE.Scene();
      const current = new THREE.Group();
      scene.add(current);
      const oldLine = makeLineMesh();
      current.add(oldLine);

      const newContent = new THREE.Group();
      const newLine = makeLineMesh();
      newContent.add(newLine);

      replaceGroupContentsWithCrossFade(current, newContent, { durationMs: 500 });

      expect(current.children).toEqual([newLine]);
      expect(newContent.children.length).toBe(0);
    });

    it('moves the old children into a sibling of `current` (not a child), so they are excluded from anything raycasting current.children', () => {
      const scene = new THREE.Scene();
      const current = new THREE.Group();
      scene.add(current);
      const oldLine = makeLineMesh();
      current.add(oldLine);

      replaceGroupContentsWithCrossFade(current, new THREE.Group(), { durationMs: 500 });

      expect(current.children).not.toContain(oldLine);
      expect(scene.children).toContain(current);
      // The old content now lives in a fresh sibling group under the same parent.
      const siblingGroups = scene.children.filter((c) => c !== current);
      expect(siblingGroups.length).toBe(1);
      expect((siblingGroups[0] as THREE.Group).children).toContain(oldLine);
    });

    it('applies the given transform to the fading-out sibling (e.g. the counter-rotation the original group had)', () => {
      const scene = new THREE.Scene();
      const current = new THREE.Group();
      scene.add(current);
      current.add(makeLineMesh());

      replaceGroupContentsWithCrossFade(current, new THREE.Group(), {
        durationMs: 500,
        applyTransform: (g) => { g.rotation.y = 1.23; }
      });

      const sibling = scene.children.find((c) => c !== current) as THREE.Group;
      expect(sibling.rotation.y).toBeCloseTo(1.23, 6);
    });

    it('returns null (no fade-out) and just clears synchronously when there is nothing to fade from', () => {
      const current = new THREE.Group(); // no parent, no children — first build
      const newContent = new THREE.Group();
      newContent.add(makeLineMesh());

      const handle = replaceGroupContentsWithCrossFade(current, newContent, { durationMs: 500 });

      expect(handle).toBeNull();
      expect(current.children.length).toBe(1);
    });

    it('eventually removes the fading-out sibling from the scene once its fade completes', () => {
      const scene = new THREE.Scene();
      const current = new THREE.Group();
      scene.add(current);
      current.add(makeLineMesh());

      replaceGroupContentsWithCrossFade(current, new THREE.Group(), { durationMs: 500 });
      expect(scene.children.length).toBe(2);

      runFrames(1, 500); // fade-out completes
      expect(scene.children.length).toBe(1);
      expect(scene.children[0]).toBe(current);
    });
  });
  describe('screen-point marks', () => {
    /*
     * Their opacity is a uniform. A ShaderMaterial also HAS a `.opacity` property,
     * which their shader ignores — so before this case existed, a fade wrote to it,
     * nothing changed on screen, and the fade reported success. The volcano
     * catalogue's tier cross-fade is the caller that depends on this.
     */
    it('fades the uniform the shader actually reads', () => {
      const points = makeScreenPoints(0.55);
      const group = new THREE.Group();
      group.add(points);

      fadeGroupIn(group, 500);

      const material = points.material as THREE.ShaderMaterial;
      expect(material.uniforms.opacity.value).toBe(0);

      runFrames(1, 500);
      expect(material.uniforms.opacity.value).toBeCloseTo(0.55, 5);
    });

    it('fades them out and disposes them', () => {
      const points = makeScreenPoints(0.55);
      const group = new THREE.Group();
      group.add(points);
      let released = 0;
      points.geometry.addEventListener('dispose', () => { released++; });
      (points.material as THREE.Material).addEventListener('dispose', () => { released++; });

      let done = false;
      fadeGroupOutThenDispose(group, 500, false, () => { done = true; });
      runFrames(1, 500);

      expect(done).toBe(true);
      expect(released).toBe(2);
    });
  });

});

describe('replaceGroupContentsWithCrossFade: the outgoing copy stands where the holder stood', () => {
  it('takes the holder\'s scale, its place in the draw order and whether it rides the shell (decision K5)', async () => {
    const { ridesShell, isShellRider } = await import('../../../globe-engine/shellLift');
    const scene = new THREE.Scene();
    const holder = ridesShell(new THREE.Group());
    holder.scale.setScalar(1.033);
    holder.renderOrder = 200;
    holder.add(new THREE.Mesh());
    scene.add(holder);
    const incoming = new THREE.Group();
    incoming.add(new THREE.Mesh());

    replaceGroupContentsWithCrossFade(holder, incoming, { reducedMotion: false, durationMs: 10_000 });

    const outgoing = scene.children.find((c) => c !== holder) as THREE.Group;
    expect(outgoing.scale.x).toBeCloseTo(1.033);
    expect(outgoing.renderOrder).toBe(200);
    expect(isShellRider(outgoing)).toBe(true);
  });
});
