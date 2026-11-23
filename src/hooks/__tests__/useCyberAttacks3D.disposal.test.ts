/**
 * Regression test for a real GPU-resource leak: useCyberAttacks3D rebuilds its
 * marker sets whenever the clusters or the chosen sub-layers change.
 * THREE.Group.clear() only detaches children — it never calls
 * geometry.dispose()/material.dispose() — so every rebuild previously leaked the
 * prior set's resources indefinitely for as long as the layer stayed active.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D } from '../useCyberAttacks3D';
import type { CyberAttackData } from '../../types/CyberAttacks';

function makeAttack(overrides: Partial<CyberAttackData> = {}): CyberAttackData {
  return {
    id: 'attack-1',
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 4,
    metadata: { source: 'Test Source', confidence: 0.85 },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    },
    ...overrides
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

describe('useCyberAttacks3D — disposes GPU resources, not just detaching children', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([makeAttack()]);
    disposeMock.mockClear();
    // Re-established every test: this project's global test setup
    // (src/setupVitest.ts) runs vi.restoreAllMocks() in its own afterEach after every
    // single test, which resets a vi.fn()-created mock's implementation — a constructor
    // mock set up once at module load would silently return undefined from the second
    // test onward.
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: disposeMock
    }) as unknown as RealTimeAttackService; });
  });

  const spyOnDisposal = (group: THREE.Group) => [...group.children].map((child) => ({
    geom: vi.spyOn((child as THREE.Points).geometry, 'dispose'),
    mat: vi.spyOn((child as THREE.Points).material as THREE.Material, 'dispose')
  }));

  it('disposes cluster marker geometry/material when the layer is deactivated', async () => {
    const scene = new THREE.Scene();
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) => useCyberAttacks3D(isActive, scene, null, { updateInterval: 999999 }),
      { initialProps: { isActive: true } }
    );

    // One indicator set (no halo, since the fixture doesn't set metadata.isNew).
    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(1));
    const spies = spyOnDisposal(result.current.attacksGroup);

    await act(async () => {
      rerender({ isActive: false });
    });

    spies.forEach(({ geom, mat }) => {
      expect(geom).toHaveBeenCalledTimes(1);
      expect(mat).toHaveBeenCalledTimes(1);
    });
    expect(result.current.attacksGroup.children.length).toBe(0);

    unmount();
  });

  it('disposes the previous set when the records change and the layer is redrawn', async () => {
    const { result, unmount } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));
    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(1));
    const spies = spyOnDisposal(result.current.attacksGroup);
    const before = result.current.attacksGroup.children[0];

    getDataMock.mockResolvedValue([makeAttack({ id: 'attack-2' })]);
    await act(async () => { await result.current.refresh(); });

    await waitFor(() => expect(result.current.attacksGroup.children[0]).not.toBe(before));
    spies.forEach(({ geom, mat }) => {
      expect(geom).toHaveBeenCalledTimes(1);
      expect(mat).toHaveBeenCalledTimes(1);
    });
    unmount();
  });
});
