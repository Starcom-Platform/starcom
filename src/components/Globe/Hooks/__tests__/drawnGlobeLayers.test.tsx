/**
 * The layers the globe draws, for what renders outside the layer control's provider. A popup sits
 * above it (App.tsx, RoutedPopupLayer), so the Geopolitical layers popup could not tell a layer was
 * drawn from its sub-mode or a pin: its status read nothing, and its counts would have read 0.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobeLayerControlProvider, useGlobeLayerControl } from '../useGlobeLayerControl';
import { useGlobeLayerDrawn } from '../drawnGlobeLayers';

const mode = vi.hoisted(() => ({ current: { mode: 'GeoPolitical', subMode: 'DiplomaticEvents' } as { mode: string; subMode: string } }));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: mode.current, setPrimaryMode: vi.fn(), setVisualizationMode: vi.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <GlobeLayerControlProvider>{children}</GlobeLayerControlProvider>;

beforeEach(() => { mode.current = { mode: 'GeoPolitical', subMode: 'DiplomaticEvents' }; });

describe('the layers the globe draws, read outside the provider', () => {
  it('say the primary layer is drawn', () => {
    renderHook(() => useGlobeLayerControl(), { wrapper });
    const outside = renderHook(() => useGlobeLayerDrawn('DiplomaticEvents'));
    expect(outside.result.current).toBe(true);
  });

  it('follow a pin and an unpin', () => {
    const control = renderHook(() => useGlobeLayerControl(), { wrapper });
    const outside = renderHook(() => useGlobeLayerDrawn('ResourceZones'));
    expect(outside.result.current).toBe(false);
    act(() => control.result.current.pinLayer('ResourceZones'));
    expect(outside.result.current).toBe(true);
    act(() => control.result.current.unpinLayer('ResourceZones'));
    expect(outside.result.current).toBe(false);
  });

  it('say nothing is drawn once the provider is gone', () => {
    const control = renderHook(() => useGlobeLayerControl(), { wrapper });
    const outside = renderHook(() => useGlobeLayerDrawn('DiplomaticEvents'));
    act(() => control.unmount());
    expect(outside.result.current).toBe(false);
  });
});
