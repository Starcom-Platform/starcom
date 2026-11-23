/**
 * Verifies useCommHubs3D's connectivity layer: a real single-cable-dependency country
 * (per commHubsConnectivity.ts's honest "at least this many, from what's known in this
 * dataset" signal) gets its landing-point marker recolored amber; everything else keeps
 * the default cyan. Off by default, like CyberThreats' density/enrichment layers — it's
 * an analytical overlay on already-shown content, not this sub-mode's first content.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCommHubs3D } from '../useCommHubs3D';
import { PopupProvider } from '../../components/Popup/PopupManager';
import type { SubmarineCableData } from '../../types/CommHubs';

// useCommHubs3D calls usePopup() internally for its click-to-detail popup (Phase D).
const popupWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PopupProvider, null, children);

const getSubmarineCableDataMock = vi.fn();

vi.mock('../../services/comm-hubs/SubmarineCableService', () => ({
  getSubmarineCableData: () => getSubmarineCableDataMock()
}));

function makeData(): SubmarineCableData {
  return {
    cables: [
      {
        id: 'a',
        name: 'A',
        color: '#e63946',
        paths: [[[0, 0], [1, 1]]],
        isPlanned: false,
        landingPoints: [{ id: 'lp-solo', name: 'Solo Point', country: 'Solomon Islands' }]
      },
      {
        id: 'b',
        name: 'B',
        color: '#457b9d',
        paths: [[[2, 2], [3, 3]]],
        isPlanned: false,
        landingPoints: [{ id: 'lp-redundant', name: 'Redundant Point', country: 'Japan' }]
      },
      {
        id: 'c',
        name: 'C',
        color: '#2a9d8f',
        paths: [[[4, 4], [5, 5]]],
        isPlanned: false,
        landingPoints: [{ id: 'lp-redundant', name: 'Redundant Point', country: 'Japan' }]
      }
    ],
    landingPoints: [
      { id: 'lp-solo', name: 'Solo Point', latitude: -9, longitude: 160, isTbd: false },
      { id: 'lp-redundant', name: 'Redundant Point', latitude: 35, longitude: 139, isTbd: false }
    ],
    fetchedAt: Date.now(),
    datasetCableCount: 3
  };
}

/**
 * The colour a given landing point was DRAWN in, read off the mark set.
 *
 * Every landing point is one point of one THREE.Points now, so the colour lives in the
 * geometry's colour attribute at that point's index rather than on a material of its
 * own. Read back through THREE.Color so the comparison is against the same
 * representation buildScreenPoints wrote.
 */
function drawnLandingPoint(group: THREE.Group, id: string) {
  const marks = group.children.find((c) => c.userData.type === 'commHubLandingPoint') as THREE.Points;
  const drawn = marks.userData.landingPoints as Array<{
    point: { id: string }; count: number; country?: string; isSingleDependency: boolean;
  }>;
  const index = drawn.findIndex((d) => d.point.id === id);
  const attribute = marks.geometry.getAttribute('pointColor');
  const color = new THREE.Color(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  return { ...drawn[index], colorHex: color.getHex() };
}

describe('useCommHubs3D — connectivity layer', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('does not recolor landing points when connectivity is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: true, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const solo = drawnLandingPoint(result.current.hubsGroup, 'lp-solo');
    expect(solo.colorHex).toBe(0x00c2ff);
    expect(solo.isSingleDependency).toBe(false);
  });

  it('recolors a real single-cable-dependency country\'s landing point amber when connectivity is on', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: true, connectivity: true } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const solo = drawnLandingPoint(result.current.hubsGroup, 'lp-solo');
    expect(solo.colorHex).toBe(0xffa630);
    expect(solo.isSingleDependency).toBe(true);
    expect(solo.country).toBe('Solomon Islands');
  });

  it('leaves a real redundantly-served country\'s landing point at the default color when connectivity is on', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: true, connectivity: true } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const redundant = drawnLandingPoint(result.current.hubsGroup, 'lp-redundant');
    expect(redundant.colorHex).toBe(0x00c2ff);
    expect(redundant.isSingleDependency).toBe(false);
  });

  it('exposes real per-country connectivity and chokepoint data from the hook return value', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: true, connectivity: true } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.connectivity.length).toBe(2));
    const solomon = result.current.connectivity.find((c) => c.country === 'Solomon Islands');
    expect(solomon?.isSingleCableDependency).toBe(true);
    const japan = result.current.connectivity.find((c) => c.country === 'Japan');
    expect(japan?.isSingleCableDependency).toBe(false);
    expect(japan?.cableIds).toEqual(['b', 'c']);
  });
});
