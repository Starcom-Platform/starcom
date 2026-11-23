import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualizationOverlayProvider } from '../../context/VisualizationOverlayContext';
import { GeoPoliticalSettingsProvider } from '../useGeoPoliticalSettings';
import { useVisualizationOverlay } from '../useVisualizationOverlay';
import { nationalTerritoriesService } from '../../geopolitical/services/NationalTerritoriesService';

// nationalTerritoriesService is a module-level singleton shared by all four GeoPolitical
// overlays — its cache had no release path at all before this fix (clearCache() existed
// but nothing ever called it). This test drives that release path via the real
// VisualizationOverlayContext toggles, the same way an operator would in the app.
const Harness: React.FC = () => {
  const { nationalTerritoriesOverlayEnabled, toggleNationalTerritoriesOverlay } = useVisualizationOverlay();
  return (
    <div>
      <div data-testid="enabled">{String(nationalTerritoriesOverlayEnabled)}</div>
      <button onClick={toggleNationalTerritoriesOverlay}>toggle</button>
    </div>
  );
};

function renderHarness() {
  return render(
    <VisualizationOverlayProvider>
      <GeoPoliticalSettingsProvider>
        <Harness />
      </GeoPoliticalSettingsProvider>
    </VisualizationOverlayProvider>
  );
}

describe('useGeoPoliticalSettings — releases nationalTerritoriesService cache after all overlays are off', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clears the shared service cache 60s after the last overlay disables', () => {
    const clearCacheSpy = vi.spyOn(nationalTerritoriesService, 'clearCache').mockImplementation(() => {});
    renderHarness();

    // nationalTerritoriesOverlayEnabled defaults true — disable it.
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('enabled').textContent).toBe('false');

    act(() => { vi.advanceTimersByTime(59_000); });
    expect(clearCacheSpy).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(clearCacheSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the release if an overlay is re-enabled before the debounce fires', () => {
    const clearCacheSpy = vi.spyOn(nationalTerritoriesService, 'clearCache').mockImplementation(() => {});
    renderHarness();

    fireEvent.click(screen.getByText('toggle')); // disable
    act(() => { vi.advanceTimersByTime(30_000); });
    fireEvent.click(screen.getByText('toggle')); // re-enable before the 60s debounce fires

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(clearCacheSpy).not.toHaveBeenCalled();
  });

  it('does not release the cache while an overlay is still enabled', () => {
    const clearCacheSpy = vi.spyOn(nationalTerritoriesService, 'clearCache').mockImplementation(() => {});
    renderHarness();

    // Never disabled — stays enabled for the whole test.
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(clearCacheSpy).not.toHaveBeenCalled();
  });
});
