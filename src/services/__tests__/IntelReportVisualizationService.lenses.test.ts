/**
 * The big-three lenses on the globe's report service (D-CT, CT5): applied before the cap, so
 * the cap is spent on the lens's reports, and what they left out is counted. A report's
 * sources ride to its marker (CT2).
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

const at = (i: number) => new Date(Date.UTC(2026, 9, 16, 12, i));
const report = (id: string, hashtags: string[], minute: number, over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title: `Report ${id}`, content: 'Body', author: 'publisher', category: 'GEOINT', tags: ['nostr'], hashtags,
  latitude: 10, longitude: 20, createdAt: at(minute), updatedAt: at(minute), status: 'SUBMITTED', ...over,
});
const ids = (markers: { pubkey: string }[]) => markers.map((m) => m.pubkey);

describe('IntelReportVisualizationService: the big-three lenses', () => {
  let listReports: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listReports = vi.spyOn(intelReportService, 'listReports');
    intelReportVisualizationService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    intelReportVisualizationService.clearCache();
  });

  it('spends the cap on the chosen lens, newest first, and counts the rest', async () => {
    listReports.mockResolvedValue([
      report('new-plain', ['world_note'], 9),
      report('new-plain-2', [], 8),
      report('tcs-1', ['lens:tcs'], 7),
      report('cbc', ['lens:cbc'], 6),
      report('tcs-2', ['lens:tcs', 'lens:idc'], 5),
      report('tcs-3', ['lens:tcs'], 4),
    ]);

    const shown = await intelReportVisualizationService.getIntelReportMarkers({ maxReports: 2, lenses: ['tcs'] });
    expect(ids(shown)).toEqual(['tcs-1', 'tcs-2']);
    expect(intelReportVisualizationService.getLastMatchingCountBeforeCap()).toBe(3);
    expect(intelReportVisualizationService.getLastHiddenByLens()).toBe(3);
  });

  it('hides nothing under All', async () => {
    listReports.mockResolvedValue([report('a', ['lens:idc'], 2), report('b', [], 1)]);

    expect(ids(await intelReportVisualizationService.getIntelReportMarkers({ lenses: [] }))).toEqual(['a', 'b']);
    expect(intelReportVisualizationService.getLastHiddenByLens()).toBe(0);
  });

  it("carries a report's sources to its marker, in their order", async () => {
    listReports.mockResolvedValue([report('sourced', ['lens:cbc'], 1, {
      sourceLinks: ['https://www.occ.gov/news/a', 'https://www.fincen.gov/news/b'],
    })]);

    const [marker] = await intelReportVisualizationService.getIntelReportMarkers({});
    expect(marker.sourceLinks).toEqual(['https://www.occ.gov/news/a', 'https://www.fincen.gov/news/b']);
  });
});
