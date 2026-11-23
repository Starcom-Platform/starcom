/**
 * The projector's contract, which is mostly about what it does NOT republish.
 *
 * Real THREE objects throughout: the hook calls `getWorldPosition` and
 * `Vector3.project(camera)`, and a hand-built literal that satisfies the hook
 * without satisfying three is how the globe test suites came to throw nine
 * unhandled exceptions while passing. Geometry and cameras need no WebGL
 * context — only the renderer does.
 *
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { useModelScreenProjection } from '../useModelScreenProjection';

const RECT = { width: 1000, height: 800, top: 0, left: 0, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) };

const makeCamera = () => {
  const camera = new THREE.PerspectiveCamera(50, RECT.width / RECT.height, 0.1, 2000);
  camera.position.set(0, 0, 500);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
};

const makeModel = (pubkey: string, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return { mesh, report: { pubkey } };
};

/*
 * Built ONCE per test and reused across renders.
 *
 * Calling this inside renderHook's callback rebuilds the models array and both
 * refs on every render, so the effect's deps change every time, so it re-runs,
 * sets state, and re-renders — a loop that took the vitest worker down with
 * ERR_IPC_CHANNEL_CLOSED rather than a failing assertion.
 */
const harness = (models: ReturnType<typeof makeModel>[], enabled = true) => {
  const camera = makeCamera();
  const container = { current: { getBoundingClientRect: () => RECT } } as unknown as React.RefObject<HTMLDivElement>;
  const globeRef = { current: { camera: () => camera } } as React.RefObject<{ camera: () => THREE.Camera }>;
  return { camera, globeRef, containerRef: container, models, enabled };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useModelScreenProjection', () => {
  it('projects a model to a position inside the container', () => {
    const params = harness([makeModel('a')]);
    const { result } = renderHook(() => useModelScreenProjection(params));

    const pos = result.current.getModelScreenPosition('a');
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeGreaterThanOrEqual(0);
    expect(pos!.x).toBeLessThanOrEqual(RECT.width);
    expect(pos!.y).toBeGreaterThanOrEqual(0);
    expect(pos!.y).toBeLessThanOrEqual(RECT.height);
  });

  it('returns null for a model it has never seen', () => {
    const params = harness([makeModel('a')]);
    const { result } = renderHook(() => useModelScreenProjection(params));
    expect(result.current.getModelScreenPosition('not-a-model')).toBeNull();
  });

  it('does nothing at all while disabled', () => {
    // The caller owns this gate because deciding it needs the interaction state
    // the hook is kept away from. If the gate did not work, that separation
    // would have bought nothing.
    const params = harness([makeModel('a')], false);
    const { result } = renderHook(() => useModelScreenProjection(params));
    expect(result.current.getModelScreenPosition('a')).toBeNull();
  });

  it('keeps the PREVIOUS Vector2 instance when a model has barely moved', () => {
    /*
     * Identity, not equality. Under the 15px threshold the projector reuses the
     * existing instance rather than an equal copy — the component did that, and
     * a caller may be comparing by reference to decide whether to reposition.
     */
    const model = makeModel('a');
    const params = harness([model]);
    const { result } = renderHook(() => useModelScreenProjection(params));

    const first = result.current.getModelScreenPosition('a');
    expect(first).not.toBeNull();

    // A movement far below the threshold at this camera distance.
    model.mesh.position.x += 0.01;
    model.mesh.updateMatrixWorld(true);
    act(() => { vi.advanceTimersByTime(600); });

    expect(result.current.getModelScreenPosition('a')).toBe(first);
  });

  it('republishes once a model moves past the threshold', () => {
    const model = makeModel('a');
    const params = harness([model]);
    const { result } = renderHook(() => useModelScreenProjection(params));

    const first = result.current.getModelScreenPosition('a')!;
    model.mesh.position.x += 200;
    model.mesh.updateMatrixWorld(true);
    act(() => { vi.advanceTimersByTime(600); });

    const moved = result.current.getModelScreenPosition('a')!;
    expect(moved).not.toBe(first);
    expect(Math.abs(moved.x - first.x)).toBeGreaterThan(15);
  });

  it('skips work while the tab is hidden', () => {
    // Otherwise it projects every 500ms in a background page, against a globe
    // nobody is looking at.
    const model = makeModel('a');
    const params = harness([model]);
    const { result } = renderHook(() => useModelScreenProjection(params));
    const first = result.current.getModelScreenPosition('a');

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    model.mesh.position.x += 200;
    model.mesh.updateMatrixWorld(true);
    act(() => { vi.advanceTimersByTime(2000); });

    expect(result.current.getModelScreenPosition('a')).toBe(first);
  });

  it('ignores models with no mesh or no pubkey rather than throwing', () => {
    const models = [makeModel('a'), { report: { pubkey: 'no-mesh' } }, { mesh: new THREE.Object3D() }] as never;
    const params = harness(models);
    const { result } = renderHook(() => useModelScreenProjection(params));

    expect(result.current.getModelScreenPosition('a')).not.toBeNull();
    expect(result.current.getModelScreenPosition('no-mesh')).toBeNull();
  });

  it('stops its interval and listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const params = harness([makeModel('a')]);
    const { unmount } = renderHook(() => useModelScreenProjection(params));

    unmount();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    // A surviving interval would keep projecting against an unmounted tree.
    expect(vi.getTimerCount()).toBe(0);
  });
});
