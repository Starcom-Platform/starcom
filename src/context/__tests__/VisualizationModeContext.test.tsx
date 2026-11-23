import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { VisualizationModeProvider, useVisualizationMode } from '../VisualizationModeContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <VisualizationModeProvider>{children}</VisualizationModeProvider>
);

// settingsStorage stores under `starcom-${key}`, wrapped as { version, timestamp, data }.
const seed = (key: string, data: unknown) => {
  localStorage.setItem(`starcom-${key}`, JSON.stringify({ version: 1, timestamp: Date.now(), data }));
};

describe('VisualizationModeContext — stale NationalTerritories subMode sanitization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the default GeoPolitical subMode when persisted mode has the removed NationalTerritories value', async () => {
    seed('visualization-mode', { mode: 'GeoPolitical', subMode: 'NationalTerritories' });

    const { result } = renderHook(() => useVisualizationMode(), { wrapper });

    await waitFor(() => {
      expect(result.current.visualizationMode.mode).toBe('GeoPolitical');
    });
    // Must not flow the stale string through untyped — falls back to a real, valid subMode.
    expect(result.current.visualizationMode.subMode).toBe('DiplomaticEvents');
  });

  it('falls back to the default GeoPolitical subMode when persisted last-selected-submodes has the removed value', async () => {
    seed('visualization-mode', { mode: 'CyberCommand', subMode: 'IntelReports' });
    seed('last-selected-submodes', {
      CyberCommand: 'IntelReports',
      GeoPolitical: 'NationalTerritories',
      EcoNatural: 'EcologicalDisasters'
    });

    const { result } = renderHook(() => useVisualizationMode(), { wrapper });

    await waitFor(() => {
      expect(result.current.visualizationMode.mode).toBe('CyberCommand');
    });

    result.current.setPrimaryMode('GeoPolitical');

    await waitFor(() => {
      expect(result.current.visualizationMode.mode).toBe('GeoPolitical');
    });
    expect(result.current.visualizationMode.subMode).toBe('DiplomaticEvents');
  });

  it('leaves a valid persisted GeoPolitical subMode untouched', async () => {
    seed('visualization-mode', { mode: 'GeoPolitical', subMode: 'ResourceZones' });

    const { result } = renderHook(() => useVisualizationMode(), { wrapper });

    await waitFor(() => {
      expect(result.current.visualizationMode.subMode).toBe('ResourceZones');
    });
  });

  it('falls back to Raver Watch\'s own default when a stored Raver Watch layer is not one it has', async () => {
    seed('visualization-mode', { mode: 'RaverWatch', subMode: 'Atlantis' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('RaverWatch'));
    expect(result.current.visualizationMode.subMode).toBe('DrugCheckAlerts');
  });

  // Stored before Raver Watch existed, so it names no layer for it: settingsStorage's
  // merge fills that from the defaults, and this holds it so.
  it('lands on a Raver Watch layer for someone whose stored choices predate the mode', async () => {
    seed('visualization-mode', { mode: 'CyberCommand', subMode: 'IntelReports' });
    seed('last-selected-submodes', { CyberCommand: 'Satellites', GeoPolitical: 'ConflictZones', EcoNatural: 'SpaceWeather' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('CyberCommand'));

    result.current.setPrimaryMode('RaverWatch');

    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('RaverWatch'));
    expect(result.current.visualizationMode.subMode).toBe('DrugCheckAlerts');
  });

  it('lands on Raver Watch\'s default when the stored choice for it is not one of its layers', async () => {
    seed('visualization-mode', { mode: 'CyberCommand', subMode: 'IntelReports' });
    seed('last-selected-submodes', { CyberCommand: 'IntelReports', GeoPolitical: 'ConflictZones', EcoNatural: 'SpaceWeather', RaverWatch: 'Atlantis' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('CyberCommand'));

    result.current.setPrimaryMode('RaverWatch');

    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('RaverWatch'));
    expect(result.current.visualizationMode.subMode).toBe('DrugCheckAlerts');
  });
});

describe('VisualizationModeContext — Hero Watch (D-HW)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves a stored choice of RLSH under Intel Watch to Hero Watch, where RLSH now lives', async () => {
    seed('visualization-mode', { mode: 'CyberCommand', subMode: 'RLSH' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode).toEqual({ mode: 'HeroWatch', subMode: 'RLSH' }));
  });

  it('keeps RLSH as Hero Watch\'s last choice, and gives Intel Watch its default, for someone who last chose RLSH', async () => {
    seed('visualization-mode', { mode: 'GeoPolitical', subMode: 'WarConflict' });
    seed('last-selected-submodes', { CyberCommand: 'RLSH', GeoPolitical: 'WarConflict', EcoNatural: 'SpaceWeather', RaverWatch: 'HeatRisk' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('GeoPolitical'));
    result.current.setPrimaryMode('CyberCommand');
    await waitFor(() => expect(result.current.visualizationMode).toEqual({ mode: 'CyberCommand', subMode: 'IntelReports' }));
    result.current.setPrimaryMode('HeroWatch');
    await waitFor(() => expect(result.current.visualizationMode).toEqual({ mode: 'HeroWatch', subMode: 'RLSH' }));
  });

  it('lands on the lifeboats for someone whose stored choices predate Hero Watch', async () => {
    seed('visualization-mode', { mode: 'CyberCommand', subMode: 'IntelReports' });
    seed('last-selected-submodes', { CyberCommand: 'IntelReports', GeoPolitical: 'ConflictZones', EcoNatural: 'SpaceWeather', RaverWatch: 'HeatRisk' });
    const { result } = renderHook(() => useVisualizationMode(), { wrapper });
    await waitFor(() => expect(result.current.visualizationMode.mode).toBe('CyberCommand'));
    result.current.setPrimaryMode('HeroWatch');
    await waitFor(() => expect(result.current.visualizationMode).toEqual({ mode: 'HeroWatch', subMode: 'Lifeboats' }));
  });
});
