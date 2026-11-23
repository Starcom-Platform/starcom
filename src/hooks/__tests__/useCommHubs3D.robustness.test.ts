/**
 * Phase B hardening pass: rendering edge cases surfaced by careful multi-pass review.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
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

describe('useCommHubs3D — invalid real cable color falls back safely', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset();
  });

  it('falls back to a neutral gray rather than passing a malformed real color string straight to THREE.Color', async () => {
    const data: SubmarineCableData = {
      cables: [{ id: 'x', name: 'X', color: 'not-a-real-color', paths: [[[0, 0], [1, 1]]], isPlanned: false, landingPoints: [] }],
      landingPoints: [],
      fetchedAt: Date.now(),
      datasetCableCount: 1
    };
    getSubmarineCableDataMock.mockResolvedValue(data);

    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const line = result.current.hubsGroup.children[0] as THREE.Line;
    const material = line.material as THREE.LineBasicMaterial;
    expect(material.color.getHexString()).toBe('888888');
  });

  it('accepts a real valid 3-digit hex shorthand color', async () => {
    const data: SubmarineCableData = {
      cables: [{ id: 'x', name: 'X', color: '#0af', paths: [[[0, 0], [1, 1]]], isPlanned: false, landingPoints: [] }],
      landingPoints: [],
      fetchedAt: Date.now(),
      datasetCableCount: 1
    };
    getSubmarineCableDataMock.mockResolvedValue(data);

    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, { layerTypes: { cables: true, landingPoints: false, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const line = result.current.hubsGroup.children[0] as THREE.Line;
    const material = line.material as THREE.LineBasicMaterial;
    expect(material.color.getHexString()).toBe('00aaff');
  });
});

describe('useCommHubs3D — landing point with no known real cable reference sizes as zero, not one', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset();
  });

  it('a landing point absent from every cable\'s real landingPoints list reports cableCount 0, matching the click-detail popup', async () => {
    const data: SubmarineCableData = {
      cables: [], // no real per-cable linkage at all — a real, fairly common coverage gap
      landingPoints: [{ id: 'orphan', name: 'Orphan Point', latitude: 0, longitude: 0, isTbd: false }],
      fetchedAt: Date.now(),
      datasetCableCount: 0
    };
    getSubmarineCableDataMock.mockResolvedValue(data);

    const scene = new THREE.Scene();
    const { result } = renderHook(
      () => useCommHubs3D(true, scene, null, { layerTypes: { cables: false, landingPoints: true, connectivity: false } }),
      { wrapper: popupWrapper }
    );

    await waitFor(() => expect(result.current.hubsGroup.children.length).toBe(1));
    const marks = result.current.hubsGroup.children[0] as THREE.Points;
    const drawn = marks.userData.landingPoints as Array<{ count: number }>;
    expect(drawn[0].count).toBe(0);
  });
});

describe('useCommHubs3D — unmounting mid-fetch does not update state after teardown', () => {
  beforeEach(() => {
    getSubmarineCableDataMock.mockReset();
  });

  it('skips the post-fetch debug log (and by extension the setState it precedes) once the hook has already torn down', async () => {
    // React 18 already silently no-ops a setState call after unmount, so a bare
    // console.error assertion wouldn't discriminate a working cancelled guard from a
    // missing one. log.debug's call site sits right before the guarded setState in the
    // .then() handler (see useCommHubs3D.ts), so asserting it never fires proves the
    // early `if (cancelled) return;` actually ran.
    let resolveFetch!: (data: SubmarineCableData) => void;
    getSubmarineCableDataMock.mockReturnValue(new Promise<SubmarineCableData>((resolve) => { resolveFetch = resolve; }));

    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const { unmount } = renderHook(() => useCommHubs3D(true, scene, null, { debugMode: true }), { wrapper: popupWrapper });

    unmount();

    // Resolves the real fetch's underlying promise only after the hook has already torn
    // down — this is exactly the mid-flight-unmount scenario the cancelled flag guards.
    await act(async () => {
      resolveFetch({ cables: [], landingPoints: [], fetchedAt: Date.now(), datasetCableCount: 0 });
      await Promise.resolve();
    });

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    consoleDebugSpy.mockRestore();
  });
});
