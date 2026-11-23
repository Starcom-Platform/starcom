/**
 * Verifies useCommHubs3D's historical cable-growth playback (Phase F): when
 * historicalYearCutoff is set (the TimeScrubber is scrubbed, not live — see
 * Globe.tsx's wiring from useTemporalStateOptional()), only real cables with a known
 * rfsYear <= that year are rendered.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCommHubs3D } from '../useCommHubs3D';
import { PopupProvider } from '../../components/Popup/PopupManager';
import type { SubmarineCableData } from '../../types/CommHubs';

const popupWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PopupProvider, null, children);

const getSubmarineCableDataMock = vi.fn();

vi.mock('../../services/comm-hubs/SubmarineCableService', () => ({
  getSubmarineCableData: () => getSubmarineCableDataMock()
}));

function makeData(): SubmarineCableData {
  return {
    cables: [
      { id: 'old', name: 'Old Cable (2001)', color: '#e63946', paths: [[[0, 0], [1, 1]]], isPlanned: false, rfsYear: 2001, landingPoints: [] },
      { id: 'recent', name: 'Recent Cable (2020)', color: '#457b9d', paths: [[[2, 2], [3, 3]]], isPlanned: false, rfsYear: 2020, landingPoints: [] },
      { id: 'unknown', name: 'Unknown-date Cable', color: '#2a9d8f', paths: [[[4, 4], [5, 5]]], isPlanned: true, landingPoints: [] }
    ],
    landingPoints: [],
    fetchedAt: Date.now(),
    datasetCableCount: 3
  };
}

describe('useCommHubs3D — historical cable-growth playback', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset().mockResolvedValue(makeData());
  });

  it('renders every real cable when historicalYearCutoff is not set (live)', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(3));
  });

  it('only renders real cables in service by the scrubbed year', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, {
        layerTypes: { cables: true, landingPoints: false, connectivity: false },
        historicalYearCutoff: 2010
      }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const lines = result.current.hubsGroup.children as THREE.Line[];
    expect((lines[0].userData.cable as { id: string }).id).toBe('old');
  });

  it('excludes a real cable with no known rfsYear at any scrubbed year — honest unknown, not assumed pre-existing', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, {
        layerTypes: { cables: true, landingPoints: false, connectivity: false },
        historicalYearCutoff: 2026
      }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(2));
    const ids = (result.current.hubsGroup.children as THREE.Line[]).map((l) => (l.userData.cable as { id: string }).id);
    expect(ids).not.toContain('unknown');
    expect(ids.sort()).toEqual(['old', 'recent']);
  });

  it('falls back to live (no filter) rather than hiding every real cable when historicalYearCutoff is NaN', async () => {
    // A corrupted TemporalContext.currentTime (new Date(NaN).getFullYear()) would
    // otherwise make every `rfsYear <= NaN` comparison false, silently rendering zero
    // cables with no error — this is the guard against that failure mode.
    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, {
        layerTypes: { cables: true, landingPoints: false, connectivity: false },
        historicalYearCutoff: NaN
      }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(3));
  });
});
