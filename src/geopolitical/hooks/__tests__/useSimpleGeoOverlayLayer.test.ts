// useSimpleGeoOverlayLayer.test.ts — targets the stale-build race the factory
// must guard against: buildContent is async with multiple internal awaits
// (see useResourceZones3D.ts/useDiplomaticEvents3D.ts), so a disable, or a
// second build starting before the first settles, is a realistic user action
// (toggling an overlay off mid-fetch), not a hypothetical. Without the
// generation-token guard in useSimpleGeoOverlayLayer.ts, a build that
// resolves after being superseded would still register/activate the layer
// and mutate the scene, undoing the disable or clobbering newer content.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as THREE from 'three';
import { globalLayerRegistry } from '../../LayerRegistry';
import { useSimpleGeoOverlayLayer } from '../useSimpleGeoOverlayLayer';
import { getRegisteredTooltipGroups } from '../../../components/Globe/pointTooltipRegistry';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSimpleGeoOverlayLayer', () => {
  afterEach(() => {
    // globalLayerRegistry is a module-level singleton shared across tests —
    // each test below uses a unique layerId, so nothing to reset, but this
    // guards against a future test reusing an id and getting confusing
    // leftover 'active' status from a prior test.
    vi.restoreAllMocks();
  });

  it('registers and activates the layer on a normal build (baseline, non-regression)', async () => {
    const layerId = 'test-layer-normal';
    const scene = new THREE.Scene();
    const built = new THREE.Group();
    const buildContent = vi.fn(async () => built);

    const { result } = renderHook(() =>
      useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 5, buildContent })
    );

    await flushMicrotasks();

    expect(globalLayerRegistry.getStatus(layerId)).toBe('active');
    expect(scene.children).toContain(built);
    expect(result.current.groupRef.current).toBe(built);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('discards an in-flight first build if disabled before it resolves, instead of reviving the layer', async () => {
    const layerId = 'test-layer-race-disable';
    const scene = new THREE.Scene();
    const built = new THREE.Group();
    built.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const d = deferred<THREE.Group>();
    const buildContent = vi.fn(() => d.promise);

    const { rerender } = renderHook(
      ({ enabled }) => useSimpleGeoOverlayLayer({ enabled, scene, layerId, layerOrder: 1, buildContent }),
      { initialProps: { enabled: true } }
    );

    expect(buildContent).toHaveBeenCalledTimes(1);

    // Disable before the in-flight build resolves.
    rerender({ enabled: false });

    d.resolve(built);
    await flushMicrotasks();

    // The layer must stay un-registered/un-activated — the disable must win.
    expect(globalLayerRegistry.getStatus(layerId)).toBeUndefined();
    expect(scene.children.length).toBe(0);
    // The orphaned group's contents must be disposed, not just dropped.
    expect(built.children.length).toBe(0);
  });

  it('discards a stale rebuild superseded by a newer one, keeping the newer content', async () => {
    // Regression note: the obvious assertion here — "scene still contains
    // the newer group object" — passes even without the fix, because
    // replaceGroupContentsWithCrossFade mutates the *existing* registered
    // group's children in place rather than swapping in a new object
    // identity. The actual bug is content clobbering: the stale build's
    // content gets cross-faded INTO the live group, silently replacing the
    // newer content with older data. Distinguishable child names are needed
    // to catch that.
    const layerId = 'test-layer-race-supersede';
    const scene = new THREE.Scene();

    const groupOld = new THREE.Group();
    groupOld.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    groupOld.children[0].name = 'old-content';
    const dOld = deferred<THREE.Group>();
    const buildOld = vi.fn(() => dOld.promise);

    const groupNew = new THREE.Group();
    groupNew.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    groupNew.children[0].name = 'new-content';
    const dNew = deferred<THREE.Group>();
    const buildNew = vi.fn(() => dNew.promise);

    const { result, rerender } = renderHook(
      ({ buildContent }) => useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 2, buildContent }),
      { initialProps: { buildContent: buildOld } }
    );
    expect(buildOld).toHaveBeenCalledTimes(1);

    // A config change starts a second build before the first settles.
    rerender({ buildContent: buildNew });
    expect(buildNew).toHaveBeenCalledTimes(1);

    // The newer build settles first and wins.
    dNew.resolve(groupNew);
    await flushMicrotasks();
    expect(result.current.groupRef.current?.children.map((c) => c.name)).toEqual(['new-content']);

    // The older, now-stale build settles late — must not clobber the newer content.
    dOld.resolve(groupOld);
    await flushMicrotasks();

    expect(result.current.groupRef.current?.children.map((c) => c.name)).toEqual(['new-content']);
  });

  it('re-shows real content after a full disable→re-enable cycle, not just an empty registry-tracked husk', async () => {
    // Regression test: LayerRegistry.build() only ever assigns its own
    // st.group once (build() no-ops once st.group is truthy). Before this
    // fix, the disable-cleanup effect nulled groupRef.current and cleared
    // its children but never told the registry — so on re-enable,
    // buildAll() created a brand-new populated group and assigned it to
    // groupRef.current, but registry.activate() saw its OWN stale st.group
    // (the original, now-permanently-emptied group) as "already in
    // scene.children" and skipped scene.add() entirely. The real new
    // content ended up with no scene parent at all — invisible forever,
    // while scene.children still held only an empty husk.
    const layerId = 'test-layer-disable-reenable-cycle';
    const scene = new THREE.Scene();

    let buildCount = 0;
    const buildContent = vi.fn(async () => {
      buildCount++;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = `content-${buildCount}`;
      g.add(mesh);
      return g;
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useSimpleGeoOverlayLayer({ enabled, scene, layerId, layerOrder: 1, buildContent }),
      { initialProps: { enabled: true } }
    );
    await flushMicrotasks();
    expect(scene.children.length).toBe(1);
    expect((scene.children[0] as THREE.Group).children.length).toBe(1);

    rerender({ enabled: false });
    await flushMicrotasks();
    rerender({ enabled: true });
    await flushMicrotasks();

    // The group actually parented in the scene must be the same object
    // groupRef exposes, and it must have real, visible content — not an
    // orphaned rebuild sitting outside the scene graph.
    expect(scene.children.includes(result.current.groupRef.current!)).toBe(true);
    expect(result.current.groupRef.current?.children.length).toBeGreaterThan(0);
    expect(scene.children.length).toBe(1);
  });

  /*
   * Diplomacy, Conflict Zones and Resources build their marks with hover text,
   * and nothing showed it: the hover hit-tests only groups registered with
   * pointTooltipRegistry, and this factory never registered its own (critique
   * audit of 2026-10-01, section 11; plan block F, item 6).
   */
  it('registers its group for hover text while it is on, and withdraws it when it goes off', async () => {
    const layerId = 'test-layer-tooltips';
    const scene = new THREE.Scene();
    const built = new THREE.Group();
    const buildContent = vi.fn(async () => built);
    const { rerender } = renderHook(({ enabled }) =>
      useSimpleGeoOverlayLayer({ enabled, scene, layerId, layerOrder: 5, buildContent }), { initialProps: { enabled: true } });
    await flushMicrotasks();
    expect(getRegisteredTooltipGroups()).toContain(built);

    rerender({ enabled: false });
    await flushMicrotasks();
    expect(getRegisteredTooltipGroups()).not.toContain(built);
  });

  it('takes its group and hover text away when it goes with the overlay on, and a later mount draws its own', async () => {
    const layerId = 'test-layer-remount';
    const scene = new THREE.Scene();
    const first = new THREE.Group();
    const second = new THREE.Group();
    const buildFirst = async () => first;
    const buildSecond = async () => second;
    const a = renderHook(() =>
      useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 1, buildContent: buildFirst })
    );
    await flushMicrotasks();
    expect(scene.children).toEqual([first]);

    a.unmount();
    expect(scene.children).toEqual([]);
    expect(getRegisteredTooltipGroups()).not.toContain(first);

    renderHook(() =>
      useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 1, buildContent: buildSecond })
    );
    await flushMicrotasks();
    expect(scene.children).toEqual([second]);
  });

  it('puts its group in place of one an earlier caller left drawn under the same id', async () => {
    const layerId = 'test-layer-stale-entry';
    const scene = new THREE.Scene();
    const stale = new THREE.Group();
    globalLayerRegistry.register({ id: layerId, order: 1, build: () => stale });
    globalLayerRegistry.activate(layerId, scene);
    const built = new THREE.Group();
    const buildContent = async () => built;
    renderHook(() =>
      useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 1, buildContent })
    );
    await flushMicrotasks();
    expect(scene.children).toEqual([built]);
  });

  it('discards a build still in flight when it goes, rather than drawing it after', async () => {
    const layerId = 'test-layer-unmount-in-flight';
    const scene = new THREE.Scene();
    const d = deferred<THREE.Group>();
    const buildContent = () => d.promise;
    const { unmount } = renderHook(() =>
      useSimpleGeoOverlayLayer({ enabled: true, scene, layerId, layerOrder: 1, buildContent })
    );
    unmount();
    d.resolve(new THREE.Group());
    await flushMicrotasks();
    expect(scene.children).toEqual([]);
  });
});
