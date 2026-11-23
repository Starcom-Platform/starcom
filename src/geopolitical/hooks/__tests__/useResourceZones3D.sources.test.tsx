/**
 * Resources merges three sources into one ranking, so a source that returned
 * nothing left no trace. With no EIA key, oil and gas — two of the three types
 * on by default — were missing from every Resources globe, and its card's one
 * "Resource zone data" line said error: null. Measured in the layer audit.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  sources: null as null | { eia: { records: number }; water: { records: number }; minerals: { records: number } },
}));

vi.mock('../useResourceZonePercentiles', () => ({
  useResourceZonePercentiles: () => ({ percentilesByCountry: new Map(), sources: state.sources, loading: false, error: null }),
}));
vi.mock('../useSimpleGeoOverlayLayer', () => ({
  useSimpleGeoOverlayLayer: () => ({ loading: false, error: null, groupRef: { current: null } }),
}));

import { useResourceZones3D } from '../useResourceZones3D';

const config = (types: Partial<Record<'oil' | 'gas' | 'minerals' | 'water' | 'renewable', boolean>>) => ({
  resourceTypes: { oil: false, gas: false, minerals: false, water: false, renewable: false, ...types },
  showProductionRates: true, showReserveData: false, zoneOpacity: 60, showTradeRoutes: false, tradeRouteIntensity: 50,
  conflictZones: { show: false, highlightDisputed: false, alertLevel: 'medium' as const },
});
const errors = (types: Parameters<typeof config>[0]) =>
  renderHook(() => useResourceZones3D({ enabled: true, scene: null, config: config(types) })).result.current.sourceErrors;

describe('useResourceZones3D says which source left a gap', () => {
  it("says EIA's figures did not load when oil or gas is on and EIA contributed nothing", () => {
    state.sources = { eia: { records: 0 }, water: { records: 180 }, minerals: { records: 90 } };
    expect(errors({ oil: true, gas: true, minerals: true }).eia).toBe("EIA's production figures did not load");
  });

  it('never asks for an EIA key: production is read without one (DP17)', () => {
    state.sources = { eia: { records: 0 }, water: { records: 180 }, minerals: { records: 90 } };
    expect(errors({ renewable: true }).eia).not.toMatch(/key/i);
  });

  it('is silent about a source whose resource types are all off', () => {
    state.sources = { eia: { records: 0 }, water: { records: 0 }, minerals: { records: 90 } };
    expect(errors({ minerals: true })).toEqual({ eia: null, water: null, minerals: null });
  });

  it('is silent about a source that contributed records', () => {
    state.sources = { eia: { records: 612 }, water: { records: 180 }, minerals: { records: 90 } };
    expect(errors({ oil: true, water: true, minerals: true })).toEqual({ eia: null, water: null, minerals: null });
  });

  it('says nothing before the first load, rather than guessing', () => {
    state.sources = null;
    expect(errors({ oil: true, water: true })).toEqual({ eia: null, water: null, minerals: null });
  });
});
