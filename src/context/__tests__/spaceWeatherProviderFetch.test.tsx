/**
 * Only the space-weather provider in use is allowed to fetch.
 *
 * ─── THE DEFECT THIS PINS ──────────────────────────────────────────────────
 *
 * SpaceWeatherContext instantiates two data providers — legacy and enterprise
 * — picks one as `baseData`, and discards the other. `autoRefresh` was already
 * gated on which is active, but that governs only the REFRESH INTERVAL: both
 * hooks fetched once on mount regardless.
 *
 * Measured on a cold load, the same two NOAA electric-field URLs were each
 * requested twice — 2.9 MB of third-party traffic, before the globe was
 * drawable, half of it thrown away on arrival.
 *
 * Nothing caught it because nothing was wrong with the rendered result. The
 * discarded copy was correct data that no one read, which is invisible to
 * every test that asserts on what the context returns.
 *
 * So these assert on the CALL, not the result. The two halves are separate on
 * purpose: the hooks must honour `enabled`, and the context must pass it.
 * Either one alone leaves the fetch happening.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';

const legacySpy = vi.fn();
const enterpriseSpy = vi.fn();
const stub = {
  interMagData: null, usCanadaData: null, alerts: [],
  isLoading: false, error: null, lastUpdated: null, refresh: vi.fn(),
};

vi.mock('../VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'EcoNatural', subMode: 'SpaceWeather' },
    setVisualizationMode: vi.fn(), setPrimaryMode: vi.fn(), resetVisualizationMode: vi.fn(),
  }),
}));
vi.mock('../../hooks/useSpaceWeatherData', () => ({
  useSpaceWeatherData: (opts: unknown) => { legacySpy(opts); return stub; },
}));
vi.mock('../../hooks/useEnterpriseSpaceWeatherData', () => ({
  useEnterpriseSpaceWeatherData: (opts: unknown) => { enterpriseSpy(opts); return stub; },
}));
vi.mock('../../utils/electricFieldNormalization', () => ({ normalizeElectricFieldVectors: () => [] }));

const { SpaceWeatherProvider, useSpaceWeatherContext } = await import('../SpaceWeatherContext');

describe('the context only lets the provider it reads fetch', () => {
  beforeEach(() => { legacySpy.mockClear(); enterpriseSpy.mockClear(); });

  it('enables the legacy provider and disables the enterprise one by default', () => {
    renderHook(() => useSpaceWeatherContext(), {
      wrapper: ({ children }) => <SpaceWeatherProvider>{children}</SpaceWeatherProvider>,
    });

    // currentProvider defaults to 'legacy', so that is the one baseData reads.
    expect(legacySpy).toHaveBeenCalled();
    expect(enterpriseSpy).toHaveBeenCalled();
    expect(legacySpy.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: true });
    expect(enterpriseSpy.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  });

  it('never enables both at once', () => {
    renderHook(() => useSpaceWeatherContext(), {
      wrapper: ({ children }) => <SpaceWeatherProvider>{children}</SpaceWeatherProvider>,
    });
    for (let i = 0; i < legacySpy.mock.calls.length; i++) {
      const l = legacySpy.mock.calls[i]?.[0] as { enabled?: boolean } | undefined;
      const e = enterpriseSpy.mock.calls[i]?.[0] as { enabled?: boolean } | undefined;
      expect(l?.enabled && e?.enabled).toBeFalsy();
    }
  });
});
