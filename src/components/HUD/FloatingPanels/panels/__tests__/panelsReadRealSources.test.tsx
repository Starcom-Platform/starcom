/**
 * The HUD panels that used to invent their contents.
 *
 * Each registered in FloatingPanelRegistrar with a plausible-looking `data`
 * payload it never read, and each held a literal fallback that was — because
 * the payload never carried the key the fallback guarded — the only branch that
 * ever ran. Every operator who opened them was shown fabricated intelligence:
 *
 *   ThreatAssessmentPanel   "Class X2.4 solar flare ... Earth-directed CME", 87%
 *   MissionControlPanel     NOAA-WATCH-001 / SOLAR-TRACK-07, counting down live
 *                           (retired by plan item 4.2: OpsCenter shows the missions)
 *   SatelliteTrackingPanel  ISS at 408km/27600kmh, next pass 23:42 UTC
 *
 * These tests assert three things per panel: it reads its real source, it says
 * so when the source is empty rather than filling in, and it distinguishes an
 * unreachable source from a quiet one. The last group asserts the specific
 * fabricated strings are gone — a crude check, and the one that would have
 * caught this in the first place.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import ThreatAssessmentPanel from '../ThreatAssessmentPanel';
import SatelliteTrackingPanel from '../SatelliteTrackingPanel';
import type { NoaaSpaceWeatherSummary } from '../../../../../services/space-weather/noaaSummary';

// ─── doubles for the real sources ──────────────────────────────────────────

const useNoaaSpaceWeatherSummary = vi.fn();
vi.mock('../../../../../hooks/useNoaaSpaceWeatherSummary', () => ({
  useNoaaSpaceWeatherSummary: () => useNoaaSpaceWeatherSummary(),
}));

const getCurrentPositions = vi.fn();
const getSatelliteInfo = vi.fn();
vi.mock('../../../../../services/Satellites/SatelliteVisualizationService', () => ({
  satelliteVisualizationService: {
    getCurrentPositions: () => getCurrentPositions(),
    getSatelliteInfo: (id: string) => getSatelliteInfo(id),
  },
}));

const NOAA_NOW = '2026-09-11T18:14:00.000Z';
const quiet = (over: Partial<NoaaSpaceWeatherSummary> = {}): NoaaSpaceWeatherSummary => ({
  observedAt: NOAA_NOW,
  scales: [{ scale: 'R', level: 0, text: 'none' }, { scale: 'S', level: 0, text: 'none' }, { scale: 'G', level: 0, text: 'none' }],
  alerts: [],
  ...over,
});
const noaa = (over: Partial<{ summary: NoaaSpaceWeatherSummary | null; loading: boolean; error: string | null }> = {}) =>
  ({ summary: quiet(), loading: false, error: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  useNoaaSpaceWeatherSummary.mockReturnValue(noaa());
  getCurrentPositions.mockReturnValue([]);
  getSatelliteInfo.mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── ThreatAssessmentPanel ─────────────────────────────────────────────────

describe('ThreatAssessmentPanel', () => {
  /*
   * The panel showed "alerts from the live NOAA feed" that were Starcom's own
   * thresholds over NOAA's electric-field grids. It now shows NOAA's scales and
   * the messages SWPC issued, as issued.
   */
  it('shows NOAA\'s current scales and the messages SWPC issued', () => {
    useNoaaSpaceWeatherSummary.mockReturnValue(noaa({ summary: quiet({
      scales: [{ scale: 'R', level: 0, text: 'none' }, { scale: 'S', level: 0, text: 'none' }, { scale: 'G', level: 1, text: 'minor' }],
      alerts: [{ productId: 'K05A', issuedAt: '2026-09-11T17:51:10.343Z', headline: 'ALERT: Geomagnetic K-index of 5' }],
    }) }));
    render(<ThreatAssessmentPanel />);
    expect(screen.getByText('G1')).toBeInTheDocument();
    expect(screen.getByText('MINOR')).toBeInTheDocument();
    expect(screen.getByText('ALERT: Geomagnetic K-index of 5')).toBeInTheDocument();
    expect(screen.getByText('1 NOAA MESSAGE · 24H')).toBeInTheDocument();
  });

  it('takes its level from NOAA\'s highest current scale, not from panel data', () => {
    useNoaaSpaceWeatherSummary.mockReturnValue(noaa({ summary: quiet({
      scales: [{ scale: 'R', level: 0, text: 'none' }, { scale: 'S', level: 0, text: 'none' }, { scale: 'G', level: 4, text: 'severe' }],
    }) }));
    render(<ThreatAssessmentPanel />);
    expect(screen.getByText('ALERT: RED')).toBeInTheDocument();
  });

  it('counts messages from NOAA\'s own time, not the clock — a day-old message is not current', () => {
    useNoaaSpaceWeatherSummary.mockReturnValue(noaa({ summary: quiet({
      alerts: [{ productId: 'K04A', issuedAt: '2026-09-10T11:08:18.677Z', headline: 'ALERT: Geomagnetic K-index of 4' }],
    }) }));
    render(<ThreatAssessmentPanel />);
    expect(screen.getByText('NO NOAA MESSAGES IN 24 HOURS')).toBeInTheDocument();
    expect(screen.queryByText('ALERT: Geomagnetic K-index of 4')).not.toBeInTheDocument();
  });

  /**
   * The distinction that matters most: a broken feed must not render as a calm
   * green light. "No data" and "no threats" are different claims.
   */
  it('reports an unreachable feed as unknown, not as all-clear', () => {
    useNoaaSpaceWeatherSummary.mockReturnValue(noaa({ summary: null, error: 'NOAA scales: HTTP 503' }));
    render(<ThreatAssessmentPanel />);
    expect(screen.getByText('ALERT: UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText('FEED UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText(/not an all-clear/i)).toBeInTheDocument();
    expect(screen.queryByText(/ALERT: GREEN/)).not.toBeInTheDocument();
  });

  it('keeps NOAA\'s last data on a failed refresh, and says the refresh failed', () => {
    useNoaaSpaceWeatherSummary.mockReturnValue(noaa({ error: 'NOAA alerts: HTTP 502' }));
    render(<ThreatAssessmentPanel />);
    expect(screen.getByText('ALERT: GREEN')).toBeInTheDocument();
    expect(screen.getByText(/Last refresh failed \(NOAA alerts: HTTP 502\)/)).toBeInTheDocument();
  });
});

// ─── SatelliteTrackingPanel ────────────────────────────────────────────────

describe('SatelliteTrackingPanel', () => {
  it('renders propagated positions merged with catalogue entries', () => {
    getCurrentPositions.mockReturnValue([
      { id: '25544', position: { x: 0, y: 0, z: 0 }, altitude: 413.2, velocity: 27580.4, lat: 12.34, lng: -56.78 },
    ]);
    getSatelliteInfo.mockReturnValue({
      id: '25544', name: 'ISS (ZARYA)', type: 'space station', altitude: 413, velocity: 27580, country: 'International',
    });
    render(<SatelliteTrackingPanel />);
    expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument();
    expect(screen.getByText('413 km')).toBeInTheDocument();
    expect(screen.getByText('12.34°')).toBeInTheDocument();
    expect(screen.getByText('TRACKING 1')).toBeInTheDocument();
  });

  it('falls back to the id, not a name, when the catalogue has no entry', () => {
    getCurrentPositions.mockReturnValue([
      { id: '99999', position: { x: 0, y: 0, z: 0 }, altitude: 700, velocity: 27000, lat: 0, lng: 0 },
    ]);
    render(<SatelliteTrackingPanel />);
    // Twice on purpose: once as the id, once standing in for the missing name.
    expect(screen.getAllByText('99999')).toHaveLength(2);
    // And 'unknown' for both the missing type and the missing country, rather
    // than a plausible guess at either.
    expect(screen.getAllByText(/unknown/i).length).toBeGreaterThanOrEqual(1);
  });

  it('says nothing is propagated rather than showing three satellites', () => {
    render(<SatelliteTrackingPanel />);
    expect(screen.getByText('NO PROPAGATED POSITIONS')).toBeInTheDocument();
  });

  it('reports a propagation failure instead of an empty orbit', async () => {
    getCurrentPositions.mockImplementation(() => { throw new Error('TLE cache empty'); });
    render(<SatelliteTrackingPanel />);
    await waitFor(() => expect(screen.getByText('PROPAGATION UNAVAILABLE')).toBeInTheDocument());
    expect(screen.getByText('TLE cache empty')).toBeInTheDocument();
    expect(screen.getByText('NO PROPAGATION')).toBeInTheDocument();
  });
});

// ─── the fabrications themselves ───────────────────────────────────────────

/**
 * Read from source rather than rendered, because the point is that these
 * strings exist nowhere in the panels — not that some particular render path
 * avoids them. A render assertion passes as soon as the fallback stops being
 * reached; this fails while the fallback is still there to be reached.
 */
describe('the fabricated data is gone from source', () => {
  const PANELS = path.join(process.cwd(), 'src/components/HUD/FloatingPanels/panels');

  const FABRICATIONS: ReadonlyArray<[file: string, needle: string]> = [
    ['ThreatAssessmentPanel.tsx', 'Class X2.4 solar flare'],
    ['ThreatAssessmentPanel.tsx', 'SOL-2025-001'],
    ['ThreatAssessmentPanel.tsx', 'Fragmentation event creating'],
    ['ThreatAssessmentPanel.tsx', 'South Atlantic Anomaly'],
    ['SatelliteTrackingPanel.tsx', 'Hubble Space Telescope'],
    ['SatelliteTrackingPanel.tsx', 'GPS Block IIF-12'],
    ['SatelliteTrackingPanel.tsx', '23:42 UTC'],
  ];

  it.each(FABRICATIONS)('%s no longer contains "%s" as data', (file, needle) => {
    const text = fs.readFileSync(path.join(PANELS, file), 'utf8');
    // Comments may quote a fabrication to explain what was removed; the
    // assertion is that it is not present as a value. Strip block comments,
    // which is where the explanations live.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain(needle);
  });

  it('the registrar no longer seeds panel data the panels ignore', () => {
    const registrar = fs.readFileSync(
      path.join(process.cwd(), 'src/components/HUD/FloatingPanels/FloatingPanelRegistrar.tsx'),
      'utf8'
    );
    const code = registrar.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const needle of ['missionCount', 'activeOperations', 'satelliteCount', 'threatCount', "alertLevel: 'orange'"]) {
      expect(code).not.toContain(needle);
    }
  });
});
