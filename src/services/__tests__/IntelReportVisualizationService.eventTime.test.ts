/**
 * The globe's report service places reports in a window by when their event
 * happened, by overlap, and counts the ones it could only place by when they were
 * written (decision D-E). It compared the last edit, an instant, against the window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

vi.mock('../intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: {
    getPersistenceStats: vi.fn(() => ({})),
    ensureInitialized: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    getReports: vi.fn(() => []),
  },
}));

import { intelReportService } from '../intel/IntelReportService';
import { intelReportVisualizationService } from '../IntelReportVisualizationService';

const DAY = 86_400_000;
const written = new Date('2026-09-12T08:00:00Z');

const report = (id: string, over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title: `Report ${id}`, content: 'Body', author: 'analyst', category: 'GENERAL', tags: [],
  latitude: 10, longitude: 20, createdAt: written, updatedAt: written, status: 'DRAFT', ...over,
});
const window = (from: string, to: string) => ({ start: new Date(from), end: new Date(to) });
const ids = (markers: { pubkey: string }[]) => markers.map((m) => m.pubkey);

describe('IntelReportVisualizationService: placing reports in a window', () => {
  let listReports: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listReports = vi.spyOn(intelReportService, 'listReports');
    // See the note in IntelReportVisualizationService.vitest.ts: the singleton
    // primes itself at import, so the first test in the file inherits that
    // cache unless it is cleared here as well as afterwards.
    intelReportVisualizationService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    intelReportVisualizationService.clearCache();
  });

  it('shows a report in the window its event falls in, not the one it was written in', async () => {
    listReports.mockResolvedValue([report('fire', { startDate: new Date('2026-07-27T00:00:00Z'), timePrecisionMs: DAY })]);

    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({ dateRange: window('2026-07-27T18:00:00Z', '2026-07-27T19:00:00Z') }))).toEqual(['fire']);
    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({ dateRange: window('2026-09-12T07:00:00Z', '2026-09-12T09:00:00Z') }))).toEqual([]);
  });

  it('matches a span by any part of it', async () => {
    listReports.mockResolvedValue([
      report('outage', { startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-10T00:00:00Z'), timePrecisionMs: DAY }),
    ]);

    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({ dateRange: window('2026-07-05T00:00:00Z', '2026-07-05T01:00:00Z') }))).toEqual(['outage']);
  });

  it('places a report with no event time by when it was written, and counts it', async () => {
    listReports.mockResolvedValue([
      report('dated', { startDate: new Date('2026-07-27T00:00:00Z'), timePrecisionMs: DAY }),
      report('undated'),
    ]);

    const shown = await intelReportVisualizationService.getIntelReportMarkers({ dateRange: window('2026-09-12T07:00:00Z', '2026-09-12T09:00:00Z') });
    expect(ids(shown)).toEqual(['undated']);
    expect(intelReportVisualizationService.getLastTimeBasisCounts()).toEqual({ judged: 2, written: 1, untimed: 0 });
  });

  it('counts nothing when no window is set, since nothing is placed in time', async () => {
    listReports.mockResolvedValue([report('undated')]);

    await intelReportVisualizationService.getIntelReportMarkers({});
    expect(intelReportVisualizationService.getLastTimeBasisCounts()).toBeNull();
  });
});

/**
 * A report whose time cannot be read has NO time — it is not "now" (decision
 * D-E; D-F step 15).
 *
 * reportToMarker fell back to Date.now() when neither an event time nor a
 * written time could be read, and this service treated a marker with no time
 * basis as the instant in `timestamp`. So an untimed report sat at the present
 * moment: shown under any time window containing now, missing from every past
 * one, and — sorted newest-first before the cache cap — always kept, pushing
 * genuinely recent reports out.
 */
describe('IntelReportVisualizationService: a report with no readable time', () => {
  let listReports: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { listReports = vi.spyOn(intelReportService, 'listReports'); });
  afterEach(() => { vi.restoreAllMocks(); intelReportVisualizationService.clearCache(); });

  const untimed = (id: string) => report(id, { createdAt: new Date('not a date'), updatedAt: new Date('not a date') });

  it('is left out of a time window, including one around the present moment', async () => {
    listReports.mockResolvedValue([untimed('lost'), report('kept')]);
    const now = Date.now();
    const aroundNow = { start: new Date(now - DAY), end: new Date(now + DAY) };

    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({ dateRange: aroundNow }))).not.toContain('lost');
  });

  /*
   * Left out, and counted as what it is. "No stated time" is not "outside the
   * window" (decision D-C: excluded AND counted, never quietly omitted).
   */
  it('is counted as untimed, not as outside the window', async () => {
    listReports.mockResolvedValue([untimed('lost'), report('kept')]);
    await intelReportVisualizationService.getIntelReportMarkers({ dateRange: window('2026-09-12T07:00:00Z', '2026-09-12T09:00:00Z') });

    expect(intelReportVisualizationService.getLastTimeBasisCounts()).toMatchObject({ judged: 2, untimed: 1 });
  });

  it('is still shown when no time window applies', async () => {
    listReports.mockResolvedValue([untimed('lost')]);

    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({}))).toEqual(['lost']);
  });

  /*
   * Where the harm was: the live path sorts newest-first and keeps 500. Stamped
   * "now", an untimed report was always the newest and always kept, so at the cap
   * it pushed out a report that really was recent. With no time it goes first.
   */
  it('is the first to go at the cache cap, not the one always kept', () => {
    const timed = Array.from({ length: 500 }, (_, i) =>
      report(`r${i}`, { createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000), updatedAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000) }));
    const kept: string[][] = [];
    const unsubscribe = intelReportVisualizationService.subscribe((markers) => kept.push(ids(markers)));
    (intelReportVisualizationService as unknown as { refreshCacheFromReports: (r: IntelReportUI[]) => void })
      .refreshCacheFromReports([untimed('lost'), ...timed]);
    unsubscribe();

    const last = kept.at(-1)!;
    expect(last).toHaveLength(500);
    expect(last).not.toContain('lost');
    expect(last).toContain('r0');
  });
});
