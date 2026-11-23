/**
 * isImplemented lets the UI say plainly that pinning a layer would do nothing,
 * instead of accepting the pin silently.
 *
 * DiplomaticEvents and ResourceZones were flagged unimplemented here, and this
 * file asserted it. It was wrong in a specific way: both renderers exist and
 * draw real data, but only their overlay toggles drove them — nothing read the
 * layer switch. So the flag described the wiring as if it were the capability.
 * Globe.tsx now drives each GeoPolitical renderer from either switch, and the
 * flags are gone. What this file cannot prove is that wiring: that is checked
 * against the running app, by scripts/audit-globe-layers.mjs.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GlobeLayerControlProvider, useGlobeLayerControl } from '../useGlobeLayerControl';

vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setPrimaryMode: vi.fn(),
    setVisualizationMode: vi.fn()
  })
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GlobeLayerControlProvider>{children}</GlobeLayerControlProvider>
);

describe('useGlobeLayerControl — isImplemented', () => {
  it('no longer flags the GeoPolitical layers, whose renderers the layer switch now drives', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const byId = Object.fromEntries(result.current.layers.map(l => [l.id, l.isImplemented]));

    expect(byId.DiplomaticEvents).toBe(true);
    expect(byId.ResourceZones).toBe(true);
    expect(byId.ConflictZones).toBe(true);
  });

  it('flags layers with real rendering as implemented', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const byId = Object.fromEntries(result.current.layers.map(l => [l.id, l.isImplemented]));

    expect(byId.IntelReports).toBe(true);
    expect(byId.CyberThreats).toBe(true);
    expect(byId.Satellites).toBe(true);
    expect(byId.SpaceWeather).toBe(true);
    expect(byId.EcologicalDisasters).toBe(true);
    // EarthWeather went from unimplemented to real rendering across Phases 1-6
    // of this session's Globe Visualization Overhaul (weather grid, wind
    // arrows, sea ice, air quality, tide/streamflow gauges).
    expect(byId.EarthWeather).toBe(true);
    // CommHubs went from an empty placeholder to real submarine cable rendering
    // across this session's CommHubs rebuild (Phases A-F).
    expect(byId.CommHubs).toBe(true);
  });

  it('IntelReports is the primary layer by default and pinning/unpinning still works', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });

    expect(result.current.isLayerActive('IntelReports')).toBe(true);
    expect(result.current.isLayerActive('CyberThreats')).toBe(false);

    act(() => result.current.togglePin('CyberThreats'));
    expect(result.current.isLayerActive('CyberThreats')).toBe(true);
    expect(result.current.pinnedCount).toBe(1);

    act(() => result.current.togglePin('CyberThreats'));
    expect(result.current.isLayerActive('CyberThreats')).toBe(false);
    expect(result.current.pinnedCount).toBe(0);
  });
});
