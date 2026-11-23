/**
 * Verifies useCommHubs3D's layerTypes gating: cables/landingPoints are two
 * independently-toggled real renderings of the same real dataset, following
 * the same "one sub-mode, N toggled real layers" shape as ConflictZones
 * (useConflictZones3D.ts) and CyberThreats (useCyberAttacks3D.ts).
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
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
        id: 'x',
        name: 'X',
        color: '#e63946',
        paths: [[[0, 0], [10, 10]]],
        isPlanned: false,
        landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Testland' }]
      },
      {
        id: 'y-planned',
        name: 'Y (planned)',
        color: '#457b9d',
        paths: [[[20, 20], [30, 30]]],
        isPlanned: true,
        landingPoints: []
      }
    ],
    landingPoints: [{ id: 'lp-1', name: 'Point 1', latitude: 0, longitude: 0, isTbd: false }],
    fetchedAt: Date.now(),
    datasetCableCount: 2
  };
}

describe('useCommHubs3D — layerTypes gating', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('defaults both cables and landingPoints on when layerTypes is not provided', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useCommHubs3D(true, scene, null), { wrapper: popupWrapper });

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(3));
    // 2 real cable lines + 1 set of landing-point marks.
  });

  it('renders only cable lines when landingPoints is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(2));
    // Line2, not THREE.Line: native line width is one device pixel, so every cable
    // drew as a hairline. Line2 extends Mesh, not Line — asserting the old base class
    // would pass for the wrong reason on anything mesh-shaped.
    expect(result.current.hubsGroup.children.every((c) => c instanceof Line2)).toBe(true);
  });

  it('renders one set of landing-point marks when cables is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: true, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const marks = result.current.hubsGroup.children[0] as THREE.Points;
    expect(marks).toBeInstanceOf(THREE.Points);
    // One object holding every landing point, rather than a sphere each.
    expect(marks.geometry.getAttribute('position').count).toBe(1);
  });

  it('renders nothing when both layers are off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.cables.length).toBe(2));
    expect(result.current.hubsGroup.children.length).toBe(0);
  });

  it('renders a real planned cable as dashed and a real active cable as solid', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(2));
    const lines = result.current.hubsGroup.children as Line2[];
    const activeLine = lines.find((l) => (l.userData.cable as { isPlanned: boolean }).isPlanned === false);
    const plannedLine = lines.find((l) => (l.userData.cable as { isPlanned: boolean }).isPlanned === true);

    // Dashing is native to LineMaterial now, so it is a flag rather than a class.
    expect((activeLine?.material as LineMaterial).dashed).toBe(false);
    expect((plannedLine?.material as LineMaterial).dashed).toBe(true);
    // And both are drawn in pixels, which is the whole reason for the change.
    expect((activeLine?.material as LineMaterial).linewidth).toBeGreaterThan(1);
    expect((plannedLine?.material as LineMaterial).linewidth)
      .toBeLessThan((activeLine?.material as LineMaterial).linewidth);
  });

  it('omits real planned cables entirely when showPlannedCables is off, keeping active cables', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCommHubs3D(true, scene, null, {
        layerTypes: { cables: true, landingPoints: false, connectivity: false },
        showPlannedCables: false
      }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const lines = result.current.hubsGroup.children as Line2[];
    expect((lines[0].userData.cable as { id: string }).id).toBe('x');
  });
});
