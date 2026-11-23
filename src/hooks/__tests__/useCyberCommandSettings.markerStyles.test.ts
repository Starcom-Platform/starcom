/**
 * A style per layer, persisted (decision D-F, step 6, part 1).
 *
 * ─── WHY THERE IS NO MIGRATION HERE, AND WHY THAT NEEDED PROVING ───────────
 *
 * The two migrations this hook already carries both exist for the same trap:
 * settingsStorage.loadSettings merges SHALLOWLY at the top level
 * ({...defaultData, ...data}), so a returning user's stored `commHubs` and
 * `intelReports` objects survive whole and a new field added INSIDE one of
 * them reaches nobody. showUnset needed a migration for exactly that reason.
 *
 * markerStyles is a new TOP-LEVEL key, which is the one case that merge
 * handles correctly on its own: a stored payload that lacks the key takes the
 * default. So a migration would be a version bump that does nothing — an
 * artifact whose only content is a claim about work it did not do.
 *
 * That argument is only worth as much as the test under it, so the returning
 * -visitor case below is the one that has to pass. If the merge ever stops
 * behaving this way, it fails here rather than silently handing every
 * returning user an undefined style.
 *
 * See useCyberCommandSettings.showUnsetMigration.test.ts for the nested case
 * that genuinely did need one.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCyberCommandSettings } from '../useCyberCommandSettings';
import { resolveMarkerStyle, DEFAULT_MARKER_STYLES } from '../../components/Globe/markerStyles';
import type { GlobeLayerId } from '../../components/Globe/Hooks/useGlobeLayerControl';

const STORAGE_KEY = 'starcom-cyber-command-settings';

/** A returning user's stored settings, saved before markerStyles existed. */
const v3PayloadWithoutStyles = () => ({
  version: 3,
  timestamp: 1767225600000,
  data: {
    intelReports: {
      overlayOpacity: 55,
      reportFiltering: { showCritical: true, showHigh: false, showMedium: false, showLow: false, showUnset: true },
      autoRefresh: true,
      refreshInterval: 2,
      maxReports: 12,
      showTimestamps: true,
      showSources: true,
    },
  },
});

describe('useCyberCommandSettings — a style per layer', () => {
  beforeEach(() => localStorage.clear());

  it('starts a new visitor with no choices, so every layer draws its default', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.markerStyles).toBeDefined());
    expect(result.current.config.markerStyles).toEqual({});

    for (const id of Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[]) {
      expect(resolveMarkerStyle(result.current.config.markerStyles, id)).toBe(DEFAULT_MARKER_STYLES[id]);
    }
  });

  /*
   * The case the absent migration rests on.
   */
  it('gives a returning visitor whose settings predate the key a usable style for every layer', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v3PayloadWithoutStyles()));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.intelReports.maxReports).toBe(12));
    expect(result.current.config.markerStyles).toEqual({});

    for (const id of Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[]) {
      expect(resolveMarkerStyle(result.current.config.markerStyles, id)).toBe(DEFAULT_MARKER_STYLES[id]);
    }
  });

  it('leaves that visitor\'s other choices exactly as they were', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v3PayloadWithoutStyles()));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.intelReports.maxReports).toBe(12));
    expect(result.current.config.intelReports.overlayOpacity).toBe(55);
    expect(result.current.config.intelReports.reportFiltering.showHigh).toBe(false);
  });

  it('records a chosen style', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());
    await waitFor(() => expect(result.current.config.markerStyles).toEqual({}));

    act(() => result.current.updateMarkerStyle('IntelReports', 'ring'));

    await waitFor(() => expect(result.current.config.markerStyles.IntelReports).toBe('ring'));
    expect(resolveMarkerStyle(result.current.config.markerStyles, 'IntelReports')).toBe('ring');
  });

  it('changes one layer without disturbing another', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());
    await waitFor(() => expect(result.current.config.markerStyles).toEqual({}));

    act(() => result.current.updateMarkerStyle('Satellites', 'glow'));
    act(() => result.current.updateMarkerStyle('ConflictZones', 'ring'));

    await waitFor(() => expect(result.current.config.markerStyles.ConflictZones).toBe('ring'));
    expect(result.current.config.markerStyles.Satellites).toBe('glow');
    // Untouched, so still its default: a halo disc (plan H4).
    expect(resolveMarkerStyle(result.current.config.markerStyles, 'IntelReports')).toBe('glow');
  });

  /*
   * The point of the whole part: a choice has to outlive the session. The save
   * is debounced by 500ms, so this waits for the write rather than asserting
   * straight after the update.
   */
  it('persists the choice so it survives a reload', async () => {
    const first = renderHook(() => useCyberCommandSettings());
    await waitFor(() => expect(first.result.current.config.markerStyles).toEqual({}));

    act(() => first.result.current.updateMarkerStyle('Satellites', 'glow'));

    await waitFor(
      () => {
        const stored = localStorage.getItem(STORAGE_KEY);
        expect(stored).toBeTruthy();
        expect(JSON.parse(stored as string).data.markerStyles).toEqual({ Satellites: 'glow' });
      },
      { timeout: 3000 },
    );

    first.unmount();
    const second = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(second.result.current.config.markerStyles.Satellites).toBe('glow'));
  });
});

/*
 * One store, not a copy per caller (decision D-F, section 18).
 *
 * The share handle and the globe each called this hook. Each held its own copy,
 * so Mecha Jono's setMarkerStyle through the handle changed the handle's copy and
 * the globe kept drawing from its own. A choice made anywhere has to reach
 * everything drawing from it.
 */
describe('useCyberCommandSettings — shared between callers', () => {
  beforeEach(() => localStorage.clear());

  it('shows a style chosen by one caller to every other caller', async () => {
    const globe = renderHook(() => useCyberCommandSettings());
    const handle = renderHook(() => useCyberCommandSettings());

    act(() => handle.result.current.updateMarkerStyle('IntelReports', 'ring'));

    await waitFor(() => expect(globe.result.current.config.markerStyles.IntelReports).toBe('ring'));
    globe.unmount();
    handle.unmount();
  });

  it('keeps the choice once every caller has gone, for the next visit', async () => {
    const first = renderHook(() => useCyberCommandSettings());
    act(() => first.result.current.updateMarkerStyle('SpaceWeather', 'glow'));
    first.unmount();

    const next = renderHook(() => useCyberCommandSettings());
    await waitFor(() => expect(next.result.current.config.markerStyles.SpaceWeather).toBe('glow'));
    next.unmount();
  });
});
