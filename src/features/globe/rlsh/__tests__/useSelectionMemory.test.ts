import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRLSHSelectionMemory } from '../useSelectionMemory';
import type { RLSHOverlayMarker } from '../../../../interfaces/RLSHOverlay';

type ModelLike = {
  report: {
    pubkey: string;
    latitude: number;
    longitude: number;
    groupId?: string;
  };
};

const makeMarker = (id: string, latitude: number, longitude: number): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0',
  id,
  displayName: id,
  summary: `${id} summary`,
  canonicalUrl: `https://example.org/${id}`,
  latitude,
  longitude,
  updatedAt: '2026-03-09T00:00:00.000Z',
  source: {
    provider: 'primary_wiki',
    sourceId: id
  },
  geoConfidence: 'city',
  tags: ['RLSH']
});

describe('useRLSHSelectionMemory', () => {
  it('returns clicked marker when no memory exists', () => {
    const models: ModelLike[] = [{
      report: {
        pubkey: 'marker-a',
        latitude: 32.7157,
        longitude: -117.1611
      }
    }];

    const { result } = renderHook(() => useRLSHSelectionMemory({ isRLSHMode: true, models }));

    const seed = result.current.getPopupSeedForReport(models[0].report);
    expect(seed.clickedLocationKey).toBe('32.71570|-117.16110');
    expect(seed.clickedGroupKey).toBe('32.71570|-117.16110');
    expect(seed.preferredMarkerId).toBeNull();
    expect(seed.initialPopupMarkerId).toBe('marker-a');
  });

  it('uses remembered marker for same location/group', () => {
    const models: ModelLike[] = [{
      report: {
        pubkey: 'marker-a',
        latitude: 32.7157,
        longitude: -117.1611
      }
    }];

    const { result } = renderHook(() => useRLSHSelectionMemory({ isRLSHMode: true, models }));

    act(() => {
      result.current.recordMarkerSelection(
        makeMarker('marker-b', 32.7157, -117.1611),
        '32.71570|-117.16110',
        '32.71570|-117.16110'
      );
    });

    const seed = result.current.getPopupSeedForReport(models[0].report);
    expect(seed.preferredMarkerId).toBe('marker-b');
    expect(seed.initialPopupMarkerId).toBe('marker-b');
  });
});