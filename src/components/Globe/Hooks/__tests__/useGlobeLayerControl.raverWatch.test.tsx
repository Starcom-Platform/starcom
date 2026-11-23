/**
 * Raver Watch in the layer catalogue (globe record, section 19, Phase 1 step 2).
 *
 * Its six layers are listed, and the two whose sources are not online yet say
 * they are not built rather than showing empty. And RLSH is never shown in this
 * mode, pinned or not: a house rule of Mecha Jono's, and ours.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobeLayerControlProvider, useGlobeLayerControl, type GlobeLayerId } from '../useGlobeLayerControl';
import { layerHonoursMarkerStyle, MARKER_STYLE_SUPPORT } from '../../markerStyles';
import { SHARE_HANDLE_CONTRACT } from '../../../../features/globe/capture/shareHandleContract';

const mode = vi.hoisted(() => ({ current: { mode: 'CyberCommand', subMode: 'IntelReports' } as { mode: string; subMode: string } }));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: mode.current, setPrimaryMode: vi.fn(), setVisualizationMode: vi.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <GlobeLayerControlProvider>{children}</GlobeLayerControlProvider>;

beforeEach(() => { mode.current = { mode: 'CyberCommand', subMode: 'IntelReports' }; });

describe('useGlobeLayerControl — Raver Watch', () => {
  it('lists its six layers under Raver Watch, and says which are not built', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const ours = result.current.layers.filter((l) => l.category === 'RaverWatch');
    expect(ours.map((l) => [l.id, l.isImplemented])).toEqual([
      ['DrugCheckAlerts', true], ['SceneIncidents', true],
      ['SceneEvents', true], ['HeatRisk', true], ['RaverMissions', true], ['HarmReductionSites', false],
    ]);
  });

  // A drawn layer called "no marks" hides what its key explains; one not drawn has none.
  it('says its drawn layers\' marks are their own key, and the rest have none', () => {
    expect(['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions'].map((id) => MARKER_STYLE_SUPPORT[id as GlobeLayerId]))
      .toEqual(Array(5).fill('shape-is-the-legend'));
    expect(MARKER_STYLE_SUPPORT.HarmReductionSites).toBe('no-marks');
  });

  it('never shows RLSH in Raver Watch, pinned or not, and shows it again outside it', () => {
    const { result, rerender } = renderHook(() => useGlobeLayerControl(), { wrapper });
    act(() => result.current.pinLayer('RLSH'));
    expect(result.current.isLayerActive('RLSH')).toBe(true);

    mode.current = { mode: 'RaverWatch', subMode: 'DrugCheckAlerts' };
    rerender();
    expect(result.current.isLayerActive('RLSH')).toBe(false);
    expect(result.current.activeLayers.has('RLSH')).toBe(false);
    expect(result.current.layers.find((l) => l.id === 'RLSH')?.isActive).toBe(false);
    expect(result.current.isLayerActive('DrugCheckAlerts')).toBe(true);

    mode.current = { mode: 'EcoNatural', subMode: 'SpaceWeather' };
    rerender();
    expect(result.current.isLayerActive('RLSH')).toBe(true);
  });

  // The level is the backing, so a style switch there would be a click that changes nothing.
  it('offers no marker style on its layers', () => {
    for (const layer of ['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites'] as const) {
      expect(layerHonoursMarkerStyle(layer), layer).toBe(false);
    }
  });

  // The contract's roster was typed by hand, and nothing compared it with the catalogue.
  it('is the layer list the share contract publishes, no more and no fewer', () => {
    // The same ids; the contract appends a new layer, while the catalogue lists it beside its kin. Psi Watch's are
    // shown to everyone since 1 Nov (OR6), and hidden for a tab by ?psi=off (D-PW, PW19, PW62).
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    expect(result.current.layers.map((l) => l.id).sort()).toEqual([...SHARE_HANDLE_CONTRACT.layers].sort());
  });

  it('leaves Psi Watch out where ?psi=off hid it', () => {
    window.history.replaceState(null, '', '/?psi=off');
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const psi = new Set(['PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows', 'MagneticShield', 'PsiModel']);
    expect(result.current.layers.map((l) => l.id).sort()).toEqual([...SHARE_HANDLE_CONTRACT.layers].filter((id) => !psi.has(id)).sort());
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });
});

describe('useGlobeLayerControl — Hero Watch (D-HW)', () => {
  it('lists its sections under Hero Watch, RLSH moved there, and says which are not built yet', () => {
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    const ours = result.current.layers.filter((l) => l.category === 'HeroWatch');
    expect(ours.map((l) => [l.id, l.isImplemented])).toEqual([
      ['Lifeboats', true], ['Relief', true], ['FieldMissions', true], ['RLSH', true],
    ]);
    expect(result.current.layers.filter((l) => l.category === 'CyberCommand').map((l) => l.id)).not.toContain('RLSH');
  });

  it('draws RLSH in Hero Watch when it is the section chosen', () => {
    mode.current = { mode: 'HeroWatch', subMode: 'RLSH' };
    const { result } = renderHook(() => useGlobeLayerControl(), { wrapper });
    expect(result.current.isLayerActive('RLSH')).toBe(true);
    expect(result.current.isLayerActive('Lifeboats')).toBe(false);
  });
});
