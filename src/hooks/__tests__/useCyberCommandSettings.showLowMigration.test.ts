/**
 * v3 -> v4: showLow becomes true, because the priority fix would otherwise start
 * hiding reports that are drawn today (decision D-F, step 6, part 4).
 *
 * ─── WHY A MIGRATION IS OWED HERE ──────────────────────────────────────────
 *
 * getIntelReportPriority compared exact UPPERCASE tag membership while the
 * ingest lowercased every hashtag, so a post tagged #low classified as `unset`
 * and was drawn — showUnset defaults true. Fixing the comparison moves it into
 * the `low` bucket, and showLow defaults FALSE. Without this migration the fix
 * would silently remove reports from a returning visitor's globe, which is the
 * same defect the v2 -> v3 showUnset migration exists to prevent.
 *
 * ─── THE CAVEAT, STATED ────────────────────────────────────────────────────
 *
 * `false` is both the default and a real choice, and storage cannot tell them
 * apart. So this may override a deliberate setting — someone who typed LOW by
 * hand into IntelWorkspaceConsole or ReportEditPanel, saw those reports, and
 * turned the filter off. That is the narrow case; silently dropping reports from
 * the network is the wider one, and it wins.
 *
 * What the migration must NOT do is fire twice. Someone who turns showLow off
 * AFTER the fix has made a choice about reports they can actually see, and the
 * last case here is what holds that line.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCyberCommandSettings } from '../useCyberCommandSettings';

const STORAGE_KEY = 'starcom-cyber-command-settings';

const payload = (version: number, filtering: Record<string, boolean>, extra: Record<string, unknown> = {}) => ({
  version,
  timestamp: 1767225600000,
  data: {
    intelReports: {
      overlayOpacity: 80,
      reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showUnset: true, ...filtering },
      autoRefresh: true,
      refreshInterval: 2,
      maxReports: 50,
      showTimestamps: true,
      showSources: true,
      ...extra,
    },
  },
});

describe('useCyberCommandSettings — showLow v3 -> v4 migration', () => {
  beforeEach(() => localStorage.clear());

  it('turns showLow on for a returning visitor who never could have chosen it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload(3, { showLow: false })));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showLow).toBe(true)
    );
  });

  it('leaves it on when it already was', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload(3, { showLow: true })));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showLow).toBe(true)
    );
  });

  it('adds it for a returning visitor whose stored filter never had the key', async () => {
    const stored = payload(3, {});
    delete (stored.data.intelReports.reportFiltering as Record<string, unknown>).showLow;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showLow).toBe(true)
    );
  });

  it('changes nothing else about their settings', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      payload(3, { showLow: false, showHigh: false, showMedium: false }, { maxReports: 12, overlayOpacity: 33 }),
    ));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.intelReports.maxReports).toBe(12));
    const filtering = result.current.config.intelReports.reportFiltering;
    expect(filtering.showLow).toBe(true);
    expect(filtering.showHigh).toBe(false);
    expect(filtering.showMedium).toBe(false);
    expect(filtering.showUnset).toBe(true);
    expect(result.current.config.intelReports.overlayOpacity).toBe(33);
  });

  it('a brand-new visitor gets showLow: true from the default', async () => {
    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() =>
      expect(result.current.config.intelReports.reportFiltering.showLow).toBe(true)
    );
  });

  /*
   * The line this must not cross. Stored at v4 means the fix had already shipped,
   * so turning showLow off was a choice about reports the person could see. The
   * migration is keyed on the version it upgrades FROM, and this proves it.
   */
  it('respects showLow: false once it is a choice someone could actually make', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload(4, { showLow: false }, { maxReports: 7 })));

    const { result } = renderHook(() => useCyberCommandSettings());

    await waitFor(() => expect(result.current.config.intelReports.maxReports).toBe(7));
    expect(result.current.config.intelReports.reportFiltering.showLow).toBe(false);
  });
});
