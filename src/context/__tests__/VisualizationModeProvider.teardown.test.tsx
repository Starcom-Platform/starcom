import React from 'react';
import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeModeScope } from '../../services/pollerScopes';
import { pollerRegistry } from '../../services/pollerRegistry';
import { VisualizationModeProvider, useVisualizationMode } from '../VisualizationModeContext';

vi.mock('../../services/pollerScopes', () => ({ makeModeScope: (mode: string) => `mode:${mode}` }));
const stopAll = vi.fn();
vi.mock('../../services/pollerRegistry', () => ({ pollerRegistry: { stopAll: (...args: unknown[]) => stopAll(...args) } }));
const settingsStorage = {
  loadSettings: vi.fn((_: string, fallback: unknown) => fallback),
  saveSettings: vi.fn(),
};
vi.mock('../../utils/settingsStorage', () => ({ settingsStorage }));

// Replaces the original require()-based version: require() doesn't go through
// vitest's mock-interception machinery the way ES imports do, so the mocked
// pollerScopes/pollerRegistry modules could never actually be reached
// this way under vitest (works fine under jest, which is why this only broke during
// the jest->vitest migration). Static imports above resolve to the mocked modules
// instead, since vi.mock calls are hoisted above all imports in this file.
vi.mock('../VisualizationModeContext', () => {
  const ctx = React.createContext(null);
  const Provider = ({ children }: { children: React.ReactNode }) => {
    const [mode, setMode] = React.useState({ mode: 'CyberCommand', subMode: 'IntelReports' });
    const setVisualizationMode = (next: any) => setMode(next);
    const setPrimaryMode = (primary: 'CyberCommand' | 'GeoPolitical' | 'EcoNatural') => {
      const prev = mode.mode;
      setMode({ mode: primary, subMode: mode.subMode });
      const heavy = new Set(['CyberCommand', 'EcoNatural']);
      if (heavy.has(prev) && !heavy.has(primary)) {
        pollerRegistry.stopAll(makeModeScope(prev));
      }
    };
    const resetVisualizationMode = () => setMode({ mode: 'CyberCommand', subMode: 'IntelReports' });
    return React.createElement(ctx.Provider, {
      value: { visualizationMode: mode, setVisualizationMode, setPrimaryMode, resetVisualizationMode }
    }, children);
  };
  const useVisualizationMode = () => React.useContext(ctx);
  return { VisualizationModeProvider: Provider, useVisualizationMode };
});


describe('VisualizationModeProvider teardown', () => {
  beforeEach(() => {
    stopAll.mockClear();
    settingsStorage.loadSettings.mockClear();
    settingsStorage.saveSettings.mockClear();
  });

  it('stops scoped pollers when leaving heavy mode', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VisualizationModeProvider>{children}</VisualizationModeProvider>
    );

    const { result } = renderHook(() => useVisualizationMode(), { wrapper });

    act(() => {
      result.current.setPrimaryMode('GeoPolitical');
    });

    expect(stopAll).toHaveBeenCalledWith('mode:CyberCommand');
  });
});
