/**
 * Regression test for the same GPU-resource leak class fixed for
 * useCyberAttacks3D: THREE.Group.clear()/remove() only detaches children — it
 * never calls geometry.dispose()/material.dispose(). useCommHubs3D rebuilds
 * cable lines and landing-point spheres whenever layerTypes changes, so those
 * resources must be explicitly disposed, not just detached.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCommHubs3D } from '../useCommHubs3D';
import { PopupProvider } from '../../components/Popup/PopupManager';
import type { SubmarineCableData } from '../../types/CommHubs';

// useCommHubs3D calls usePopup() internally for its click-to-detail popup (Phase D) —
// same requirement useCountryInfoOverlay.test.tsx documents for its own hook.
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
      }
    ],
    landingPoints: [{ id: 'lp-1', name: 'Point 1', latitude: 0, longitude: 0, isTbd: false }],
    fetchedAt: Date.now(),
    datasetCableCount: 1
  };
}

describe('useCommHubs3D — disposes GPU resources, not just detaching children', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('disposes cable line and landing-point sphere geometry/material when the layer is deactivated', async () => {
    const scene = new THREE.Scene();
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) => useCommHubs3D(isActive, scene, null),
      { initialProps: { isActive: true }, wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(2));

    const children = [...result.current.hubsGroup.children] as Array<THREE.Line | THREE.Mesh>;
    const disposeSpies = children.map((child) => ({
      geom: vi.spyOn(child.geometry, 'dispose'),
      mat: vi.spyOn(child.material as THREE.Material, 'dispose')
    }));

    await act(async () => {
      rerender({ isActive: false });
    });

    disposeSpies.forEach(({ geom, mat }) => {
      expect(geom).toHaveBeenCalledTimes(1);
      expect(mat).toHaveBeenCalledTimes(1);
    });
    expect(result.current.hubsGroup.children.length).toBe(0);

    unmount();
  });
});
