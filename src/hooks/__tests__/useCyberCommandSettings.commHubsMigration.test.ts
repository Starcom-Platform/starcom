/**
 * Regression test for a real returning-user bug: settingsStorage.loadSettings only does
 * a SHALLOW top-level merge ({...defaultData, ...data}) — a v1-shaped commHubs object
 * (the old, fully aspirational SIGINT/cell-tower/classification-filter config, replaced
 * with a real layerTypes-based shape) would otherwise survive intact in localStorage and
 * clobber the new default wholesale, crashing every reader of
 * config.commHubs.layerTypes for anyone who used the app before this change.
 *
 * Separate file from useCyberCommandSettings.test.ts, which currently fails to load for
 * reasons unrelated to this change (pre-existing, confirmed via git stash before this
 * work began).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCyberCommandSettings } from '../useCyberCommandSettings';

const STORAGE_KEY = 'starcom-cyber-command-settings';

describe('useCyberCommandSettings — commHubs v1 -> v2 migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('replaces a real v1-shaped commHubs object with the new default rather than crashing on config.commHubs.layerTypes', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      data: {
        commHubs: {
          overlayOpacity: 70,
          showSatellites: true,
          showGroundStations: true,
          showSIGINT: true,
          showCellTowers: false,
          coverageRadius: 100,
          showCoverageAreas: true,
          signalStrength: true,
          frequencyBands: { showHF: false, showVHF: true, showUHF: true, showSHF: true },
          classificationFilter: { showUnclassified: true, showConfidential: true, showSecret: false },
          refreshInterval: 10,
          maxHubs: 150,
          showSignalPaths: false,
          interferenceDetection: true
        }
      }
    }));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.commHubs.layerTypes).toBeDefined());
    expect(result.current.config.commHubs).toEqual({
      layerTypes: { cables: true, landingPoints: true, connectivity: false },
      showPlannedCables: true
    });
  });

  it('leaves a real v2-shaped commHubs object untouched', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      timestamp: Date.now(),
      data: {
        commHubs: {
          layerTypes: { cables: false, landingPoints: true, connectivity: true },
          showPlannedCables: false
        }
      }
    }));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.commHubs.layerTypes.cables).toBe(false));
    expect(result.current.config.commHubs).toEqual({
      layerTypes: { cables: false, landingPoints: true, connectivity: true },
      showPlannedCables: false
    });
  });

  it('a brand-new user with no stored settings at all gets the real v2 default directly', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.commHubs.layerTypes).toBeDefined());
    expect(result.current.config.commHubs.layerTypes).toEqual({ cables: true, landingPoints: true, connectivity: false });
  });
});
