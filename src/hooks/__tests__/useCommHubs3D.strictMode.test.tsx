/**
 * The Comm Hubs layer draws even when its fetch effect is cleaned up and run again
 * before the data arrives.
 *
 * It did not. The effect gated on an "already fetching" ref and dropped results from a
 * cancelled run, so a clean-up mid-fetch left the re-run returning early and the original
 * run discarding its data — nothing drew until a reload. React.StrictMode mounts, cleans up
 * and remounts every effect in development, so every dev load hit it (measured: the whole
 * dataset fetched and cached in 35 s, not one cable drawn after two minutes). In production
 * it took switching the layer off and on during the fetch.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCommHubs3D } from '../useCommHubs3D';
import { PopupProvider } from '../../components/Popup/PopupManager';
import type { SubmarineCableData } from '../../types/CommHubs';

const getSubmarineCableDataMock = vi.fn();

vi.mock('../../services/comm-hubs/SubmarineCableService', () => ({
  getSubmarineCableData: () => getSubmarineCableDataMock(),
}));

function makeData(): SubmarineCableData {
  return {
    cables: [{
      id: 'x', name: 'X', color: '#e63946', paths: [[[0, 0], [10, 10]]], isPlanned: false,
      landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Testland' }],
    }],
    landingPoints: [{ id: 'lp-1', name: 'Point 1', latitude: 0, longitude: 0, isTbd: false }],
    fetchedAt: Date.now(),
    datasetCableCount: 1,
  };
}

/**
 * A fetch that settles only when told to, shared by every caller — which is what the real
 * service does with its module-level in-flight promise. That sharing is what lets a re-run
 * join the same request instead of starting another.
 */
function deferredFetch() {
  let resolve!: (d: SubmarineCableData) => void;
  const promise = new Promise<SubmarineCableData>((r) => { resolve = r; });
  getSubmarineCableDataMock.mockImplementation(() => promise);
  return { resolve };
}

describe('useCommHubs3D — a fetch that outlives its effect', () => {
  beforeEach(() => { getSubmarineCableDataMock.mockReset(); });

  it('draws under React.StrictMode, which cleans up and re-runs every effect', async () => {
    const { resolve } = deferredFetch();
    const scene = new THREE.Scene();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.StrictMode, null, React.createElement(PopupProvider, null, children));

    const { result } = renderHook(() => useCommHubs3D(true, scene, null), { wrapper });
    resolve(makeData());

    await waitFor(() => expect(result.current.cables).toHaveLength(1));
    await waitFor(() => expect(result.current.hubsGroup.children.length).toBeGreaterThan(0));
  });

  it('draws after the layer is switched off and back on while the fetch is still running', async () => {
    const { resolve } = deferredFetch();
    const scene = new THREE.Scene();
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PopupProvider, null, children);

    const { result, rerender } = renderHook(({ active }) => useCommHubs3D(active, scene, null), {
      wrapper, initialProps: { active: true },
    });
    rerender({ active: false });
    rerender({ active: true });
    resolve(makeData());

    await waitFor(() => expect(result.current.cables).toHaveLength(1));
    await waitFor(() => expect(result.current.hubsGroup.children.length).toBeGreaterThan(0));
  });
});
