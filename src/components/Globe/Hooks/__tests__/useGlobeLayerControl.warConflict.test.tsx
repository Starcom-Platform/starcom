/**
 * War & Conflict in the layer catalogue, the mode, the URL and the share
 * contract (decisions WC1-WC4). A new layer under GeoPolitical, beside
 * Conflict Zones, which stays as it is: its marks are their own key, as Raver
 * Watch's are, so it offers no marker style.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GlobeLayerControlProvider, useGlobeLayerControl } from '../useGlobeLayerControl';
import { layerHonoursMarkerStyle, MARKER_STYLE_SUPPORT } from '../../markerStyles';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../../../../features/globe/capture/shareHandleContract';
import { modeFromSearch } from '../../../../context/visualizationModeFromUrl';
import { parseDeeplink } from '../../../../context/deeplinkV1';

vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'GeoPolitical', subMode: 'WarConflict' }, setPrimaryMode: vi.fn(), setVisualizationMode: vi.fn() }),
}));
const wrapper = ({ children }: { children: React.ReactNode }) => <GlobeLayerControlProvider>{children}</GlobeLayerControlProvider>;

describe('War & Conflict as a layer', () => {
  it('is listed under GeoPolitical, after Conflict Zones, built, and on when chosen', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const geo = result.current.layers.filter((l) => l.category === 'GeoPolitical').map((l) => l.id);
    expect(geo.indexOf('WarConflict')).toBe(geo.indexOf('ConflictZones') + 1);
    const layer = result.current.layers.find((l) => l.id === 'WarConflict')!;
    expect(layer).toMatchObject({ label: 'War & Conflict', isImplemented: true });
    expect(result.current.isLayerActive('WarConflict')).toBe(true);
  });

  it('offers no marker style: its marks are their own key', () => {
    expect(MARKER_STYLE_SUPPORT.WarConflict).toBe('shape-is-the-legend');
    expect(layerHonoursMarkerStyle('WarConflict')).toBe(false);
  });

  it('is reachable from a link, in either form', () => {
    expect(modeFromSearch('?sub=WarConflict')).toEqual({ mode: 'GeoPolitical', subMode: 'WarConflict' });
    expect(parseDeeplink('?v=1&sub=warconflict').sub).toBe('WarConflict');
  });

  it('is in the share contract, from v10, after Raver Watch\'s six', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(10);
    // Appended, so no older index moves: Hero Watch's sections join after it, in v40.
    const layers = SHARE_HANDLE_CONTRACT.layers;
    expect(layers.indexOf('WarConflict')).toBe(layers.indexOf('HarmReductionSites') + 1);
    expect(layers.indexOf('Lifeboats')).toBe(layers.indexOf('WarConflict') + 1);
  });
});
