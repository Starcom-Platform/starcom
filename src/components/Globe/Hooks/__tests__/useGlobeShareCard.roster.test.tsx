/**
 * The share handle offers the layers its published contract names, and no
 * others (globe record, section 19).
 *
 * A layer can join the app's catalogue before it joins the contract, as
 * Raver Watch's did, between their release and contract v8. The contract is
 * fingerprinted and read by another codebase, so an agent reading it must not
 * be handed layers it does not list, which listLayers would otherwise do,
 * since it is built from the catalogue.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
const setVisualizationMode = vi.hoisted(() => vi.fn());
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' }, setVisualizationMode }),
}));
const layer = (id: string, category: string) => ({
  id, label: id, category, description: '', isPrimary: false, isPinned: false, isActive: false, isImplemented: true,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('IntelReports', 'CyberCommand'), layer('DrugCheckAlerts', 'RaverWatch'), layer('NotYetInTheContract', 'RaverWatch')],
    pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { SHARE_HANDLE_CONTRACT } from '../../../../features/globe/capture/shareHandleContract';

type Handle = {
  listLayers: () => Array<{ id: string }>;
  setLayer: (id: string) => unknown;
  pinLayers: (ids: string[]) => unknown;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const globeRef = {
  current: {
    renderer: () => ({ domElement: { isConnected: true, clientWidth: 1280, clientHeight: 608 } }),
    scene: () => ({}), camera: () => ({}), getGlobeRadius: () => 100,
    pointOfView: () => ({ lat: 0, lng: 0, altitude: 2.5 }), controls: () => undefined,
  },
};

afterEach(() => { delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE]; });

describe('the handle’s layers', () => {
  it('are the ones its contract names, whatever else the catalogue holds', () => {
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));
    expect(handle().listLayers().map((l) => l.id)).toEqual(['IntelReports', 'DrugCheckAlerts']);
    expect((SHARE_HANDLE_CONTRACT.layers as readonly string[]).includes('NotYetInTheContract')).toBe(false);
  });

  it('refuses to set or pin a layer its contract does not name', () => {
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));
    expect(() => handle().setLayer('NotYetInTheContract')).toThrow(/No layer "NotYetInTheContract"/);
    expect(() => handle().pinLayers(['NotYetInTheContract'])).toThrow(/Unknown layer/);
    expect(setVisualizationMode).not.toHaveBeenCalled();
  });

  it('includes Raver Watch’s, since contract v8', () => {
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));
    handle().setLayer('DrugCheckAlerts');
    expect(setVisualizationMode).toHaveBeenCalledWith({ mode: 'RaverWatch', subMode: 'DrugCheckAlerts' });
  });
});

void React;
