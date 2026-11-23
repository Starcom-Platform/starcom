import * as THREE from 'three';
import { vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobeCloudLayer, cloudAngleAt } from '../useGlobeCloudLayer';
import { stillMotion, releaseMotion } from '../../../../globe-engine/captureClock';
import { imageryDrawn, resetImageryForTests } from '../../../../globe-engine/imagery';

describe('useGlobeCloudLayer', () => {
  let scene: THREE.Scene;
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    scene = new THREE.Scene();
    // Prevent an unbounded real animation loop during tests — capture calls instead.
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('does nothing while globeRef.current is not yet available', () => {
    const globeRef = { current: null } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    renderHook(() => useGlobeCloudLayer({ globeRef }));

    expect(scene.children.length).toBe(0);
  });

  test('polls until the globe scene becomes available, then adds the cloud mesh', () => {
    const globeRef = { current: null } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    renderHook(() => useGlobeCloudLayer({ globeRef }));

    expect(scene.children.length).toBe(0);

    // Scene becomes available only after the component mounts (the real-world bug
    // this hook is written to survive: react-globe.gl's scene() isn't ready at the
    // moment the effect first runs).
    (globeRef as { current: unknown }).current = { scene: () => scene };
    vi.advanceTimersByTime(200); // >= one poll interval

    expect(scene.children.length).toBe(1);
    const mesh = cloudMeshOf(scene);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    // Drawn with the ground fields, under a raised territories shell (decision K5).
    expect(scene.children[0].renderOrder).toBe(GROUND_FIELD_ORDER);
  });

  test('cloud mesh starts hidden, becomes visible once the texture loads', () => {
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    renderHook(() => useGlobeCloudLayer({ globeRef }));

    const mesh = cloudMeshOf(scene);
    // The project-wide TextureLoader mock resolves synchronously, but loadTexture()
    // itself is async (a Promise) — the mesh should already exist and be hidden
    // before that promise's .then() has had a chance to run.
    expect(mesh.visible).toBe(false);
    expect((mesh.material as THREE.MeshPhongMaterial).opacity).toBe(0);
  });

  test('starts the rotation animation loop', () => {
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    renderHook(() => useGlobeCloudLayer({ globeRef }));

    expect(rafSpy).toHaveBeenCalled();
  });

  test('cleans up on unmount: removes the mesh and disposes its resources', () => {
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    const { unmount } = renderHook(() => useGlobeCloudLayer({ globeRef }));

    expect(scene.children.length).toBe(1);
    const mesh = cloudMeshOf(scene);
    const geometry = mesh.geometry;
    const material = mesh.material as THREE.Material;
    const geometryDisposeSpy = vi.spyOn(geometry, 'dispose');
    const materialDisposeSpy = vi.spyOn(material, 'dispose');

    unmount();

    expect(scene.children.length).toBe(0);
    expect(geometryDisposeSpy).toHaveBeenCalledTimes(1);
    expect(materialDisposeSpy).toHaveBeenCalledTimes(1);
  });

  test('does not throw if the scene never becomes available', () => {
    const globeRef = { current: null } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    const { unmount } = renderHook(() => useGlobeCloudLayer({ globeRef }));

    expect(() => {
      vi.advanceTimersByTime(100 * 100 + 1000); // exceed SCENE_POLL_MAX_ATTEMPTS
      unmount();
    }).not.toThrow();
  });
});

/**
 * Clouds are fetched once the device is known to draw them.
 *
 * clouds.png is the largest single file of a first visit — 2.19 MB, measured
 * server-side on 2026-09-25 — and it was fetched the moment the globe mounted.
 * Auto quality starts at full detail and can only step down after measuring,
 * so a slow device, and every headless agent capturing for Discord, downloaded
 * clouds it then hid: the agent's own cards said "drawn without clouds because
 * this device could not keep up". Decided with the user on 2026-09-25: wait for
 * the governor to settle, then fetch only if clouds are wanted, and fade them in.
 */
import { GlobeTextureLoader } from '../../../../globe-engine/GlobeTextureLoader';
import {
  reportFrameWindow, resetGlobeQualityForTests, setGlobeQualitySetting, SETTLE_WINDOWS,
} from '../../../../services/globe/globeQuality';
import { SETTLE_FALLBACK_MS } from '../useGlobeCloudLayer';
import { GROUND_FIELD_ORDER } from '../../../../globe-engine/shellLift';
import { setResolvedGlobeSkin } from '../../../../services/globe/globeAppearance';

/** The cloud mesh, inside the group that draws it with the ground fields (globe-engine/shellLift.ts). */
const cloudMeshOf = (scene: THREE.Scene) => scene.children[0]?.children[0] as THREE.Mesh;

describe('useGlobeCloudLayer — when the clouds are fetched', () => {
  let clock = 0;
  const win = (medianMs: number) => ({ medianMs, frames: 60, at: (clock += 2000) });
  let cloudRequests: () => number;

  beforeEach(() => {
    vi.useFakeTimers();
    resetGlobeQualityForTests();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const load = vi.spyOn(GlobeTextureLoader, 'loadTexture');
    cloudRequests = () => load.mock.calls.filter(([name]) => name === 'clouds').length;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetGlobeQualityForTests();
  });

  const mount = () => {
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    return { scene, ...renderHook(() => useGlobeCloudLayer({ globeRef })) };
  };

  test('does not fetch before auto has measured the device', () => {
    mount();
    expect(cloudRequests()).toBe(0);
  });

  test('fetches once auto settles with clouds wanted', () => {
    mount();
    for (let i = 0; i < SETTLE_WINDOWS; i++) reportFrameWindow(win(10), 1);
    expect(cloudRequests()).toBe(1);
  });

  test('never fetches when auto settles without clouds', () => {
    // A device that cannot keep up steps down before settling.
    mount();
    for (let i = 0; i < SETTLE_WINDOWS; i++) reportFrameWindow(win(80), 1);
    expect(cloudRequests()).toBe(0);
  });

  test('fetches at once when the viewer pinned High', () => {
    setGlobeQualitySetting('high');
    mount();
    expect(cloudRequests()).toBe(1);
  });

  test('never fetches, or draws, the made-up clouds over the cyber globe (C28)', () => {
    setResolvedGlobeSkin('cyberEarth');
    try {
      setGlobeQualitySetting('high');
      const { scene } = mount();
      vi.advanceTimersByTime(SETTLE_FALLBACK_MS * 2);
      expect(cloudRequests()).toBe(0);
      expect(cloudMeshOf(scene)?.visible ?? false).toBe(false);
    } finally {
      setResolvedGlobeSkin('dayNight');
    }
  });

  test('fetches them on a photographed Earth, the same setting otherwise', () => {
    setResolvedGlobeSkin('dayNight');
    setGlobeQualitySetting('high');
    mount();
    expect(cloudRequests()).toBe(1);
  });

  test('never fetches when the viewer pinned Low', () => {
    setGlobeQualitySetting('low');
    mount();
    vi.advanceTimersByTime(SETTLE_FALLBACK_MS * 2);
    expect(cloudRequests()).toBe(0);
  });

  test('fetches anyway if auto never measures, so clouds cannot silently vanish', () => {
    // A missing frame reporter would otherwise leave a strong device cloudless
    // forever, with nothing saying why.
    mount();
    vi.advanceTimersByTime(SETTLE_FALLBACK_MS);
    expect(cloudRequests()).toBe(1);
  });
});

// D-W, WX2: the picture is three-globe's example, so it hides while real clouds are drawn.
describe('useGlobeCloudLayer — while real clouds are drawn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGlobeQualityForTests();
    setGlobeQualitySetting('high');
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetGlobeQualityForTests();
  });

  test('stays hidden when suppressed, even once its texture is in, and shows again when let go', async () => {
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    const { rerender } = renderHook(({ suppressed }) => useGlobeCloudLayer({ globeRef, suppressed }), { initialProps: { suppressed: true } });
    await vi.waitFor(() => expect((cloudMeshOf(scene).material as THREE.MeshPhongMaterial).map).toBeTruthy());
    const mesh = cloudMeshOf(scene);
    expect(mesh.visible).toBe(false);
    rerender({ suppressed: false });
    expect(mesh.visible).toBe(true);
    rerender({ suppressed: true });
    expect(mesh.visible).toBe(false);
  });

  test('tells a card it draws clouds only while they are in and shown, and not once it is gone (TX8)', async () => {
    resetImageryForTests();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
    const nextFrame = () => frames.pop()?.(0);
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    const { rerender, unmount } = renderHook(({ suppressed }) => useGlobeCloudLayer({ globeRef, suppressed }), { initialProps: { suppressed: true } });
    nextFrame();
    expect(imageryDrawn()).not.toContain('clouds');
    await vi.waitFor(() => expect((cloudMeshOf(scene).material as THREE.MeshPhongMaterial).map).toBeTruthy());
    nextFrame();
    expect(imageryDrawn()).not.toContain('clouds');
    rerender({ suppressed: false });
    nextFrame();
    expect(imageryDrawn()).toContain('clouds');
    unmount();
    expect(imageryDrawn()).not.toContain('clouds');
  });
});

// IM23: a capture holds the clouds at the moment's drift, fully faded in, and puts them back.
describe('the clouds in a capture', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });
  afterEach(() => {
    releaseMotion();
    vi.restoreAllMocks();
  });

  test('gives each moment one drift angle', () => {
    expect(cloudAngleAt(1_790_967_291_000)).toBe(cloudAngleAt(1_790_967_291_000));
    expect(Math.abs(cloudAngleAt(1_790_967_291_000))).toBeLessThan(Math.PI * 2);
    expect(cloudAngleAt(1_790_967_292_000)).not.toBe(cloudAngleAt(1_790_967_291_000));
  });

  test('holds the clouds at the moment\'s drift while a capture stills motion, and puts them back after', () => {
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } } as unknown as React.RefObject<import('react-globe.gl').GlobeMethods>;
    const { unmount } = renderHook(() => useGlobeCloudLayer({ globeRef }));
    const mesh = cloudMeshOf(scene);
    const material = mesh.material as THREE.MeshPhongMaterial;
    mesh.rotation.y = 1.234;
    material.opacity = 0.4;
    const at = 1_790_967_291_000;
    stillMotion(at);
    expect(mesh.rotation.y).toBe(cloudAngleAt(at));
    expect(material.opacity).toBe(1);
    // Its world matrix too, as three.js reads it for this frame: the capture renders before the next update.
    const expected = new THREE.Matrix4().makeRotationY(cloudAngleAt(at)).elements;
    mesh.matrixWorld.elements.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
    releaseMotion();
    expect(mesh.rotation.y).toBe(1.234);
    expect(material.opacity).toBe(0.4);
    unmount();
    mesh.rotation.y = 0.5;
    stillMotion(at);
    expect(mesh.rotation.y).toBe(0.5);
  });
});
