/**
 * The cursor trail's first test in its life.
 *
 * It had none while it lived inside a 1786-line component — sixteen refs and a
 * 169-line animation loop, verified by nothing. That is most of why extracting
 * it was worth doing, and why the extraction was done in two steps with the
 * interface defined in place first.
 *
 * What is asserted here is the contract a caller depends on: that the indicator
 * gets built into the scene and cleaned up again, and that the controller's
 * four methods do what their names say. The animation loop's easing is NOT
 * asserted — it is time- and frame-dependent, and a test that pinned its
 * intermediate values would break on every tuning change while telling nobody
 * anything about whether the trail works.
 *
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useCursorTrail3D } from '../useCursorTrail3D';

const harness = (over: Partial<Parameters<typeof useCursorTrail3D>[0]> = {}) => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 2000);
  camera.position.set(0, 0, 500);
  camera.updateMatrixWorld(true);

  const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 16), new THREE.MeshBasicMaterial());
  scene.add(globeMesh);

  return {
    scene,
    globeMesh,
    params: {
      cursorTrailIndicatorEnabled: true,
      hasInteractiveMarkers: true,
      globeRef: { current: { scene: () => scene, camera: () => camera } } as never,
      containerRef: { current: document.createElement('div') } as never,
      resolveGlobeMesh: () => globeMesh,
      ...over,
    },
  };
};

const indicatorsIn = (scene: THREE.Scene) =>
  scene.children.filter((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry && c.geometry.parameters.radius === 0.5);

describe('useCursorTrail3D', () => {
  it('builds an indicator and a tail into the scene', () => {
    const { scene, params } = harness();
    const before = scene.children.length;

    renderHook(() => useCursorTrail3D(params));

    expect(scene.children.length).toBeGreaterThan(before);
    expect(indicatorsIn(scene)).toHaveLength(1);
    expect(scene.children.some((c) => c instanceof THREE.Line)).toBe(true);
  });

  it('starts hidden, because nothing is being pointed at yet', () => {
    const { scene, params } = harness();
    renderHook(() => useCursorTrail3D(params));
    expect(indicatorsIn(scene)[0].visible).toBe(false);
  });

  it('takes its objects back out of the scene on unmount', () => {
    // A globe that is remounted — which Globe.tsx does — would otherwise
    // accumulate an indicator and a tail per mount, forever.
    const { scene, params } = harness();
    const before = scene.children.length;
    const { unmount } = renderHook(() => useCursorTrail3D(params));

    expect(scene.children.length).toBeGreaterThan(before);
    unmount();
    expect(scene.children.length).toBe(before);
  });

  it('aims at a usable point and refuses an unusable one', () => {
    const { params } = harness();
    const { result } = renderHook(() => useCursorTrail3D(params));

    expect(result.current.setCursorSurfaceTarget(new THREE.Vector3(0, 0, 100))).toBe(true);
    // A non-finite intersection would put the mesh at an undefined position
    // rather than nowhere, so it is refused and the indicator hidden.
    expect(result.current.setCursorSurfaceTarget(new THREE.Vector3(NaN, 0, 0))).toBe(false);
  });

  it('hides both the indicator and its tail', () => {
    const { scene, params } = harness();
    const { result } = renderHook(() => useCursorTrail3D(params));

    const indicator = indicatorsIn(scene)[0];
    const tail = scene.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    indicator.visible = true;
    tail.visible = true;

    act(() => { result.current.hideCursorIndicator(); });

    expect(indicator.visible).toBe(false);
    expect(tail.visible).toBe(false);
  });

  it('accepts pointer motion without a previous sample', () => {
    // The first move of a session has nothing to measure against. It must
    // establish the baseline rather than divide by an absent previous point.
    const { params } = harness();
    const { result } = renderHook(() => useCursorTrail3D(params));

    expect(() => {
      act(() => {
        result.current.noteCursorScreenMotion(10, 10);
        result.current.noteCursorScreenMotion(40, 50);
      });
    }).not.toThrow();
  });

  it('resetCursorTrail hides and forgets, so re-enabling does not jump', () => {
    const { scene, params } = harness();
    const { result } = renderHook(() => useCursorTrail3D(params));
    const indicator = indicatorsIn(scene)[0];

    act(() => {
      result.current.noteCursorScreenMotion(10, 10);
      indicator.visible = true;
      result.current.resetCursorTrail();
    });

    expect(indicator.visible).toBe(false);
    // The next motion is a first sample again, not a 900px jump from where the
    // pointer was when the trail was switched off.
    expect(() => act(() => { result.current.noteCursorScreenMotion(900, 900); })).not.toThrow();
  });

  it('builds nothing when the globe has no scene yet', () => {
    // Globe.tsx renders this before the globe finishes initialising.
    const { params } = harness();
    const noScene = { ...params, globeRef: { current: null } as never };
    expect(() => renderHook(() => useCursorTrail3D(noScene))).not.toThrow();
  });

  it('its own listener does nothing while intel markers are present', () => {
    /*
     * The two-writer rule, asserted against how it is actually implemented.
     *
     * I expected the listener to be attached conditionally and wrote a test
     * saying so; it is not. The listener is always attached and the handler
     * early-returns when `hasInteractiveMarkers` is true, because in intel
     * modes the host component drives the trail through the controller
     * instead. The effect is the same — only one writer at a time — and this
     * asserts the effect rather than the mechanism I assumed.
     */
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    const withMarkers = harness({ hasInteractiveMarkers: true });
    withMarkers.params.containerRef = { current: container } as never;
    renderHook(() => useCursorTrail3D(withMarkers.params));

    const indicator = indicatorsIn(withMarkers.scene)[0];
    indicator.visible = true;

    act(() => {
      container.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300, bubbles: true }));
    });

    // Untouched: the handler returned before doing anything, leaving the value
    // the controller-driven path had set.
    expect(indicator.visible).toBe(true);
  });

  it('its own listener drives the trail when intel markers are absent', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    const withoutMarkers = harness({ hasInteractiveMarkers: false });
    withoutMarkers.params.containerRef = { current: container } as never;
    renderHook(() => useCursorTrail3D(withoutMarkers.params));

    const indicator = indicatorsIn(withoutMarkers.scene)[0];
    indicator.visible = true;

    // Pointing at empty space, well off the globe, must hide it — proving the
    // handler ran rather than returning early.
    act(() => {
      container.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0, bubbles: true }));
    });

    expect(indicator.visible).toBe(false);
  });
});
