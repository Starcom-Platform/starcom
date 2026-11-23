/**
 * v2 -> v3: reportFiltering gained showUnset, separating "nobody stated a
 * priority" from "someone stated low".
 *
 * This test exists because the fix is INVISIBLE without the migration, and
 * every other test still passes. settingsStorage.loadSettings does a shallow
 * top-level merge ({...defaultData, ...data}), so a returning user's stored
 * `intelReports` object survives whole — showLow: false and all — and the new
 * showUnset default never reaches them. They would keep silently losing every
 * report the app creates for them, which is the bug this whole change is about.
 *
 * Same shallow-merge trap the v1 -> v2 commHubs migration exists for; see
 * useCyberCommandSettings.commHubsMigration.test.ts.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCyberCommandSettings } from '../useCyberCommandSettings';

const STORAGE_KEY = 'starcom-cyber-command-settings';

/** A returning user's stored settings, saved before showUnset existed. */
const v2Payload = (overrides: Record<string, unknown> = {}) => ({
  version: 2,
  timestamp: 1767225600000,
  data: {
    intelReports: {
      overlayOpacity: 80,
      reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: false },
      autoRefresh: true,
      refreshInterval: 2,
      maxReports: 50,
      showTimestamps: true,
      showSources: true,
      ...overrides,
    },
  },
});

describe('useCyberCommandSettings — showUnset v2 -> v3 migration', () => {
  beforeEach(() => localStorage.clear());

  it('adds showUnset: true to a returning user whose stored settings predate it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Payload()));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showUnset).toBe(true)
    );
  });

  it('preserves the rest of that user\'s filter choices — the migration adds, it does not reset', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Payload({
      reportFiltering: { showCritical: true, showHigh: false, showMedium: false, showLow: false },
      maxReports: 12,
    })));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showUnset).toBe(true)
    );
    const f = result.current.config.intelReports.reportFiltering;
    expect(f.showHigh).toBe(false);
    expect(f.showMedium).toBe(false);
    expect(result.current.config.intelReports.maxReports).toBe(12);
  });

  it('leaves an explicit showUnset: false alone — a deliberate choice is not overwritten', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 3,
      timestamp: 1767225600000,
      data: {
        intelReports: {
          overlayOpacity: 80,
          reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: false, showUnset: false },
          autoRefresh: true, refreshInterval: 2, maxReports: 50,
          showTimestamps: true, showSources: true,
        },
      },
    }));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.intelReports.maxReports).toBe(50));
    expect(result.current.config.intelReports.reportFiltering.showUnset).toBe(false);
  });

  it('a brand-new user with no stored settings gets showUnset: true from the default', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showUnset).toBe(true)
    );
  });
});
