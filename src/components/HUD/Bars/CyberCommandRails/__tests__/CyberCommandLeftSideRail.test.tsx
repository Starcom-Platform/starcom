import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CyberCommandLeftSideRail from '../CyberCommandLeftSideRail';
import { vi } from 'vitest';

const setVisualizationMode = vi.fn();

const modeState = {
  visualizationMode: { mode: 'CyberCommand' as const, subMode: 'IntelReports' as const },
  setVisualizationMode
};

vi.mock('../../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => modeState
}));

describe('CyberCommandLeftSideRail', () => {
  beforeEach(() => {
    setVisualizationMode.mockClear();
    modeState.visualizationMode = { mode: 'CyberCommand', subMode: 'IntelReports' };
  });

  it('renders secondary controls and selected state for active primary mode', () => {
    render(<CyberCommandLeftSideRail />);

    const intelReports = screen.getByTestId('cyber-left-rail-mode-IntelReports');
    const satellites = screen.getByTestId('cyber-left-rail-mode-Satellites');

    expect(intelReports).toHaveAttribute('aria-pressed', 'true');
    expect(satellites).toHaveAttribute('aria-pressed', 'false');
    expect(satellites).toHaveAttribute('aria-label', 'Satellites secondary mode');
  });

  it('writes secondary mode while preserving active primary mode', () => {
    render(<CyberCommandLeftSideRail />);

    fireEvent.click(screen.getByTestId('cyber-left-rail-mode-Satellites'));

    expect(setVisualizationMode).toHaveBeenCalledWith({
      mode: 'CyberCommand',
      subMode: 'Satellites'
    });
  });

  it('supports arrow key navigation across secondary controls', () => {
    render(<CyberCommandLeftSideRail />);

    const first = screen.getByTestId('cyber-left-rail-mode-IntelReports');
    const second = screen.getByTestId('cyber-left-rail-mode-CyberThreats');

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(second);
  });

  it('updates control set on primary mode transitions without stale controls', () => {
    const { rerender } = render(<CyberCommandLeftSideRail />);

    expect(screen.getByTestId('cyber-left-rail-mode-IntelReports')).toBeInTheDocument();

    modeState.visualizationMode = { mode: 'GeoPolitical', subMode: 'DiplomaticEvents' } as any;
    rerender(<CyberCommandLeftSideRail />);

    expect(screen.getByTestId('cyber-left-rail-mode-DiplomaticEvents')).toBeInTheDocument();
    expect(screen.queryByTestId('cyber-left-rail-mode-IntelReports')).toBeNull();
  });

  it('offers War & Conflict beside Conflict Zones, and keeps the mode GeoPolitical when it is chosen', () => {
    modeState.visualizationMode = { mode: 'GeoPolitical', subMode: 'ConflictZones' } as any;
    render(<CyberCommandLeftSideRail />);
    fireEvent.click(screen.getByTestId('cyber-left-rail-mode-WarConflict'));
    expect(setVisualizationMode).toHaveBeenCalledWith({ mode: 'GeoPolitical', subMode: 'WarConflict' });
  });

  // The rail saved any mode it did not name as EcoNatural (globe record, section 19).
  it('offers Raver Watch\'s layers that draw, and keeps the mode Raver Watch when one is chosen', () => {
    modeState.visualizationMode = { mode: 'RaverWatch', subMode: 'DrugCheckAlerts' } as any;
    render(<CyberCommandLeftSideRail />);

    expect(screen.getByTestId('cyber-left-rail-mode-DrugCheckAlerts')).toHaveAttribute('aria-pressed', 'true');
    // Four draw since v1.2, and Raver missions since Hero Watch's field missions (HW8); sites wait on a source.
    expect(screen.getByTestId('cyber-left-rail-mode-SceneEvents')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-rail-mode-HeatRisk')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-rail-mode-RaverMissions')).toBeInTheDocument();
    expect(screen.queryByTestId('cyber-left-rail-mode-HarmReductionSites')).toBeNull();
    fireEvent.click(screen.getByTestId('cyber-left-rail-mode-SceneIncidents'));

    expect(setVisualizationMode).toHaveBeenCalledWith({ mode: 'RaverWatch', subMode: 'SceneIncidents' });
  });
});

describe('CyberCommandLeftSideRail — Hero Watch (D-HW)', () => {
  beforeEach(() => {
    setVisualizationMode.mockClear();
  });

  it('offers Hero Watch\'s sections that draw, RLSH among them, and keeps the mode Hero Watch when one is chosen', () => {
    modeState.visualizationMode = { mode: 'HeroWatch', subMode: 'Lifeboats' } as any;
    render(<CyberCommandLeftSideRail />);
    expect(screen.getByTestId('cyber-left-rail-mode-Lifeboats')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('cyber-left-rail-mode-RLSH')).toBeInTheDocument();
    // Relief (step 4) and field missions (step 5) draw.
    expect(screen.getByTestId('cyber-left-rail-mode-Relief')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-rail-mode-FieldMissions')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cyber-left-rail-mode-RLSH'));
    expect(setVisualizationMode).toHaveBeenCalledWith({ mode: 'HeroWatch', subMode: 'RLSH' });
  });

  it('no longer offers RLSH under Intel Watch', () => {
    modeState.visualizationMode = { mode: 'CyberCommand', subMode: 'IntelReports' } as any;
    render(<CyberCommandLeftSideRail />);
    expect(screen.queryByTestId('cyber-left-rail-mode-RLSH')).toBeNull();
  });

  // New strong quakes not yet opened, counted on Eco Disasters' button (D-EQ, EQ20).
  it("counts the quake pings not yet opened on Eco Disasters' button", async () => {
    const { act } = await import('@testing-library/react');
    const pings = await import('../../../../../services/quakes/quakePings');
    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'SpaceWeather' } as unknown as typeof modeState.visualizationMode;
    render(<CyberCommandLeftSideRail />);
    expect(screen.queryByTestId('cyber-left-rail-quake-pings')).toBeNull();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const feed = (ids: string[]) => ({ type: 'FeatureCollection', features: ids.map((id) => ({
      type: 'Feature', id, properties: { mag: 6.5, time: Date.now(), title: 'M 6.5 - Somewhere', net: 'us' }, geometry: { type: 'Point', coordinates: [10, 10, 10] },
    })) });
    const reads = [feed([]), feed(['q1', 'q2'])];
    const stop = pings.watchQuakePings({ onPing: () => {}, everyMs: 1000, fetcher: async () => new Response(JSON.stringify(reads.shift() ?? feed(['q1', 'q2']))) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByTestId('cyber-left-rail-quake-pings')).toHaveTextContent('2');
    act(() => { pings.clearQuakePing('q1'); pings.clearQuakePing('q2'); });
    expect(screen.queryByTestId('cyber-left-rail-quake-pings')).toBeNull();
    stop();
    vi.useRealTimers();
    pings.resetQuakePingsForTests();
  });
});
