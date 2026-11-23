/**
 * CommHubs' landing points honour the style chosen for the layer (D-F step 6.3).
 *
 * ─── WHY THIS TESTS THE HOOK AND NOT A BUILDER ─────────────────────────────
 *
 * Satellites is the reason. Its builder honours a style and is tested for it,
 * and a mutation deleting the style from the HOOK's call survived every test in
 * the tree — so that layer is still declared `not-yet` in markerStyles.ts
 * despite being wired. A test of the thing that draws is not a test of the thing
 * that chooses.
 *
 * useCommHubs3D builds its marks inline in a useMemo, so the only place to read
 * the style back is the object in the scene. That is also the strongest place:
 * it is what the GPU is handed.
 *
 * The cables are LINES and keep their own meaning — materialTheme.ts makes
 * dashed mean provisional — so a mark style governs the landing points alone.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCommHubs3D } from '../useCommHubs3D';
import { PopupProvider } from '../../components/Popup/PopupManager';
import type { SubmarineCableData, CommHubsLayerTypes } from '../../types/CommHubs';
import { getLegends, resetLegendsForTest } from '../../services/globe/globeLegendStore';
import { MARKER_STYLES, DEFAULT_MARKER_STYLES, type MarkerStyleChoices } from '../../components/Globe/markerStyles';

// useCommHubs3D calls usePopup() internally for its click-to-detail popup.
const popupWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PopupProvider, null, children);

const getSubmarineCableDataMock = vi.fn();

vi.mock('../../services/comm-hubs/SubmarineCableService', () => ({
  getSubmarineCableData: () => getSubmarineCableDataMock()
}));

function makeData(): SubmarineCableData {
  return {
    cables: [{
      id: 'x',
      name: 'X',
      color: '#e63946',
      paths: [[[0, 0], [10, 10]]],
      isPlanned: false,
      landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Testland' }]
    }],
    landingPoints: [{ id: 'lp-1', name: 'Point 1', latitude: 0, longitude: 0, isTbd: false }],
    fetchedAt: Date.now(),
    datasetCableCount: 1
  };
}

/** The landing-point marks, found by the type the hook tags them with. */
const landingPoints = (group: THREE.Group): THREE.Points | undefined => {
  let found: THREE.Points | undefined;
  group.traverse((o) => {
    if ((o as THREE.Points).isPoints && o.userData?.type === 'commHubLandingPoint') found = o as THREE.Points;
  });
  return found;
};

const definesFor = async (markerStyles?: MarkerStyleChoices) => {
  const scene = new THREE.Scene();
  const { result, unmount } = renderHook(
    () => useCommHubs3D(true, scene, null, { markerStyles }),
    { wrapper: popupWrapper },
  );
  await waitFor(() => expect(landingPoints(result.current.hubsGroup)).toBeDefined());
  const points = landingPoints(result.current.hubsGroup)!;
  const defines = { ...((points.material as THREE.ShaderMaterial).defines ?? {}) };
  unmount();
  return defines;
};

describe('useCommHubs3D — the style chosen for the layer', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('draws a disc when nothing was chosen, exactly as before', async () => {
    const d = await definesFor(undefined);

    expect(DEFAULT_MARKER_STYLES.CommHubs).toBe('disc');
    expect(d).not.toHaveProperty('STYLE_RING');
    expect(d).not.toHaveProperty('STYLE_GLOW');
  });

  it('draws rings when rings were chosen', async () => {
    expect(await definesFor({ CommHubs: 'ring' })).toHaveProperty('STYLE_RING');
  });

  /*
   * Offered on every layer since step 6.5 put the core and the halo in one
   * object. Before that a glow through buildScreenPoints was additive light with
   * no mark inside it, and the switcher withheld it from layers in this position.
   */
  it('draws a glowing mark when a glow was chosen', async () => {
    expect(await definesFor({ CommHubs: 'glow' })).toHaveProperty('STYLE_GLOW');
  });

  /*
   * A choice made for a DIFFERENT layer must not reach this one. The choices are
   * one shared map, so reading it with the wrong key is a live mistake rather
   * than a hypothetical: it would restyle every layer at once.
   */
  it('ignores a style chosen for some other layer', async () => {
    expect(await definesFor({ SpaceWeather: 'ring' })).not.toHaveProperty('STYLE_RING');
  });

  it('can be asked for every style a person can pick', async () => {
    // Guards against a layer honouring only the styles its author happened to
    // try. Whatever MARKER_STYLES grows to, this layer has to answer for it.
    for (const style of MARKER_STYLES) {
      const d = await definesFor({ CommHubs: style });
      const reached = Object.keys(d).find((k) => k.startsWith('STYLE_')) ?? 'STYLE_DISC';
      expect(reached).toBe(`STYLE_${style.toUpperCase()}`);
    }
  });
});

/*
 * And the card is told which shape it is looking at (decision D-F, step 6.3).
 *
 * The share card prints `shapeMeans`, so an image explains why its marks are
 * rings rather than leaving a reader to guess. The shared hook derives this for
 * the layers that use it; a direct buildScreenPoints caller has to say so itself.
 */
describe('useCommHubs3D — what the card is told about the shape', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
    resetLegendsForTest();
  });

  const legendFor = async (markerStyles?: MarkerStyleChoices, layerTypes?: CommHubsLayerTypes) => {
    const scene = new THREE.Scene();
    const { result, unmount } = renderHook(
      () => useCommHubs3D(true, scene, null, { markerStyles, layerTypes }),
      { wrapper: popupWrapper },
    );
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'CommHubs')).toBeDefined());
    const legend = getLegends().find((l) => l.layerId === 'CommHubs');
    unmount();
    return legend;
  };

  it('names the shape the landing points were drawn with', async () => {
    expect((await legendFor({ CommHubs: 'ring' }))?.shapeMeans).toBe('ring');
    resetLegendsForTest();
    expect((await legendFor({ CommHubs: 'glow' }))?.shapeMeans).toBe('glow');
  });

  it('names the disc when nothing was chosen, rather than leaving it unsaid', async () => {
    expect((await legendFor(undefined))?.shapeMeans).toBe('disc');
  });

  /*
   * With the landing points toggled off the layer is cables alone. Cables are
   * lines and have no mark shape, so reporting one would describe something that
   * is not on the globe.
   */
  it('says nothing about shape when no marks were drawn', async () => {
    const legend = await legendFor({ CommHubs: 'ring' }, { cables: true, landingPoints: false, connectivity: false });

    expect(legend?.shapeMeans).toBeUndefined();
  });
});

/*
 * Changing the choice on a globe that is already drawn.
 *
 * Every test above mounts fresh, and a mutation removing the style from the
 * memo's dependencies survived all of them: the first render would be right and
 * the switcher would then do nothing. That is the whole feature — a person
 * clicks a button on a running globe — so it is worth its own test.
 *
 * The dependency is a JSON key rather than the object, because Globe.tsx hands
 * this a fresh choices object on every settings read; keying on identity would
 * rebuild every landing-point mark for nothing.
 */
describe('useCommHubs3D — the switcher changing a globe already on screen', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('redraws the landing points when the choice changes', async () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ markerStyles }) => useCommHubs3D(true, scene, null, { markerStyles }),
      { wrapper: popupWrapper, initialProps: { markerStyles: { CommHubs: 'disc' } as MarkerStyleChoices } },
    );
    await waitFor(() => expect(landingPoints(result.current.hubsGroup)).toBeDefined());
    const before = (landingPoints(result.current.hubsGroup)!.material as THREE.ShaderMaterial).defines ?? {};
    expect(before).not.toHaveProperty('STYLE_RING');

    rerender({ markerStyles: { CommHubs: 'ring' } });

    await waitFor(() => {
      const after = (landingPoints(result.current.hubsGroup)!.material as THREE.ShaderMaterial).defines ?? {};
      expect(after).toHaveProperty('STYLE_RING');
    });
  });

  it('does not rebuild the marks when an unrelated setting is re-read', async () => {
    // The same choices, in a NEW object — which is what Globe.tsx passes on
    // every render. Keyed on identity this would drop and rebuild every mark.
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ markerStyles }) => useCommHubs3D(true, scene, null, { markerStyles }),
      { wrapper: popupWrapper, initialProps: { markerStyles: { CommHubs: 'ring' } as MarkerStyleChoices } },
    );
    await waitFor(() => expect(landingPoints(result.current.hubsGroup)).toBeDefined());
    const first = landingPoints(result.current.hubsGroup);

    rerender({ markerStyles: { CommHubs: 'ring' } });

    expect(landingPoints(result.current.hubsGroup)).toBe(first);
  });

  /*
   * The card follows the switcher too, and it does so without the legend effect
   * naming the choice in its own dependencies: that effect already depends on the
   * marks memo, which is rebuilt when the style changes. A mutation adding
   * markerStyleKey there survived, which is how the redundancy was found — so
   * this test is what keeps the chain honest instead.
   */
  it('updates what the card says when the choice changes', async () => {
    resetLegendsForTest();
    const scene = new THREE.Scene();
    const { rerender } = renderHook(
      ({ markerStyles }) => useCommHubs3D(true, scene, null, { markerStyles }),
      { wrapper: popupWrapper, initialProps: { markerStyles: { CommHubs: 'disc' } as MarkerStyleChoices } },
    );
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'CommHubs')?.shapeMeans).toBe('disc'));

    rerender({ markerStyles: { CommHubs: 'ring' } });

    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'CommHubs')?.shapeMeans).toBe('ring'));
  });
});
