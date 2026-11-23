import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { VisualizationOverlayProvider } from './VisualizationOverlayContext';
import { useVisualizationOverlay } from '../hooks/useVisualizationOverlay';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <VisualizationOverlayProvider>{children}</VisualizationOverlayProvider>
);

describe('VisualizationOverlayContext — national territories overlay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to enabled', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(true);
  });

  it('toggleNationalTerritoriesOverlay actually flips state (regression: used to be hardcoded to always stay true)', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(false);

    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(true);
  });

  it('persists the real toggled value to localStorage, not a hardcoded true', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.nationalTerritoriesOverlayEnabled).toBe(false);
  });

  it('does not clobber cursorTrailIndicatorEnabled when toggling territories, and vice versa', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleCursorTrailIndicator();
    });
    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });

    expect(result.current.cursorTrailIndicatorEnabled).toBe(false);
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(false);

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.cursorTrailIndicatorEnabled).toBe(false);
    expect(stored.nationalTerritoriesOverlayEnabled).toBe(false);
  });
});

describe('VisualizationOverlayContext — resource zones overlay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to disabled (new, illustrative-data layer — opt-in, unlike the established overlays above)', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });
    expect(result.current.resourceZonesOverlayEnabled).toBe(false);
  });

  it('toggleResourceZonesOverlay flips state', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleResourceZonesOverlay();
    });
    expect(result.current.resourceZonesOverlayEnabled).toBe(true);

    act(() => {
      result.current.toggleResourceZonesOverlay();
    });
    expect(result.current.resourceZonesOverlayEnabled).toBe(false);
  });

  it('persists the toggled value to localStorage', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleResourceZonesOverlay();
    });

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.resourceZonesOverlayEnabled).toBe(true);
  });

  it('does not clobber the other two overlays when toggled, and vice versa', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleCursorTrailIndicator();
    });
    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });
    act(() => {
      result.current.toggleResourceZonesOverlay();
    });

    expect(result.current.cursorTrailIndicatorEnabled).toBe(false);
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(false);
    expect(result.current.resourceZonesOverlayEnabled).toBe(true);

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.cursorTrailIndicatorEnabled).toBe(false);
    expect(stored.nationalTerritoriesOverlayEnabled).toBe(false);
    expect(stored.resourceZonesOverlayEnabled).toBe(true);
  });
});

describe('VisualizationOverlayContext — diplomatic events overlay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to disabled (new, illustrative-data layer — opt-in, same stance as resource zones)', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });
    expect(result.current.diplomaticEventsOverlayEnabled).toBe(false);
  });

  it('toggleDiplomaticEventsOverlay flips state', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleDiplomaticEventsOverlay();
    });
    expect(result.current.diplomaticEventsOverlayEnabled).toBe(true);

    act(() => {
      result.current.toggleDiplomaticEventsOverlay();
    });
    expect(result.current.diplomaticEventsOverlayEnabled).toBe(false);
  });

  it('persists the toggled value to localStorage', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleDiplomaticEventsOverlay();
    });

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.diplomaticEventsOverlayEnabled).toBe(true);
  });

  it('does not clobber the other three overlays when toggled, and vice versa', () => {
    const { result } = renderHook(() => useVisualizationOverlay(), { wrapper });

    act(() => {
      result.current.toggleCursorTrailIndicator();
    });
    act(() => {
      result.current.toggleNationalTerritoriesOverlay();
    });
    act(() => {
      result.current.toggleResourceZonesOverlay();
    });
    act(() => {
      result.current.toggleDiplomaticEventsOverlay();
    });

    expect(result.current.cursorTrailIndicatorEnabled).toBe(false);
    expect(result.current.nationalTerritoriesOverlayEnabled).toBe(false);
    expect(result.current.resourceZonesOverlayEnabled).toBe(true);
    expect(result.current.diplomaticEventsOverlayEnabled).toBe(true);

    const stored = JSON.parse(localStorage.getItem('visualization-overlay-settings') || '{}');
    expect(stored.cursorTrailIndicatorEnabled).toBe(false);
    expect(stored.nationalTerritoriesOverlayEnabled).toBe(false);
    expect(stored.resourceZonesOverlayEnabled).toBe(true);
    expect(stored.diplomaticEventsOverlayEnabled).toBe(true);
  });
});
