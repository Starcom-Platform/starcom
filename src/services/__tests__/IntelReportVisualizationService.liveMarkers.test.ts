/**
 * A report delivered from the network survives a refresh that reads storage.
 *
 * ─── WHAT THIS PINS, AND HOW IT WAS FOUND ──────────────────────────────────
 *
 * The globe has two ways to learn about a report: `addMarker`, called by the
 * Nostr ingest the moment one arrives, and `refreshCacheFromReports`, called
 * whenever the workspace store changes. The second REPLACED the cache with
 * whatever storage held — and a report from a relay is not in storage — so
 * every network report was drawn and then silently erased a few seconds later.
 *
 * Measured against a local relay on 2026-09-20 with one polygon published:
 *
 *   +18.0s {"stored":0,"cache":1,"adds":2,"notify":4}    <- drawn
 *   +22.0s {"stored":0,"cache":0,"adds":2,"notify":149}  <- gone
 *
 * The persistence that was meant to bridge the two channels cannot: it is
 * asynchronous, it is allowed to fail, and its failure is swallowed by design
 * so that a storage fault does not cost the globe its live reports. That makes
 * the merge — not the persistence — the thing that has to be right.
 *
 * The second test pins the notification storm the same defect produced: with an
 * empty cache, `isCacheValid` answered false forever, so every caller refetched
 * and every refetch notified every subscriber. 145 notifications in four
 * seconds, each one a re-render of the globe.
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
import { IntelReportVisualizationService } from '../IntelReportVisualizationService';

const when = new Date('2026-09-20T20:11:27.000Z');

const report = (id: string, over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id,
  title: `Report ${id}`,
  content: 'Body',
  author: 'analyst',
  category: 'GEOINT',
  tags: [],
  latitude: 10,
  longitude: 8,
  createdAt: when,
  updatedAt: when,
  status: 'DRAFT',
  ...over,
});

/**
 * The shape the ingest actually stores: `[lat, lon]` pairs in `parts`, with the
 * vertex counts boundedOutline carries. A fixture shaped like the real record,
 * not like the assertion it is about to make.
 */
const fromRelay = report('relay-polygon', {
  tags: ['nostr', 'relay:ws://localhost:7447', 'geometry:polygon-centroid'],
  outline: {
    kind: 'polygon',
    parts: [[[10, 14], [10.52264, 13.96713], [11.02704, 13.86825], [10, 14]]],
    sourceVertices: 65,
    keptVertices: 4,
  },
});

describe('IntelReportVisualizationService: a report from the network', () => {
  let notifyStorage: ((reports: IntelReportUI[]) => void) | undefined;
  let service: IntelReportVisualizationService;

  beforeEach(async () => {
    notifyStorage = undefined;
    vi.spyOn(intelReportService, 'onChange').mockImplementation((listener) => {
      notifyStorage = listener as (reports: IntelReportUI[]) => void;
      return () => {};
    });
    vi.spyOn(intelReportService, 'listReports').mockResolvedValue([]);
    service = new IntelReportVisualizationService();
    // The constructor primes the cache from storage; let that settle so it
    // cannot land on top of what the test does next.
    await vi.waitFor(() => expect(notifyStorage).toBeTypeOf('function'));
    await Promise.resolve();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a live report when storage changes without it', async () => {
    service.addMarker(fromRelay);
    expect(service.getDebugStats().cacheSize).toBe(1);

    // The workspace changed, and it has never heard of this report.
    notifyStorage?.([]);

    const markers = await service.getIntelReportMarkers();
    expect(markers.map((m) => m.pubkey)).toEqual(['relay-polygon']);
    expect(markers[0].outline?.parts[0][0]).toEqual([10, 14]);
  });

  it('prefers the stored copy once the same report is persisted', async () => {
    service.addMarker(fromRelay);
    // The pipeline's flush landed: the same report, now durable and edited.
    notifyStorage?.([report('relay-polygon', { title: 'Report relay-polygon (stored)' })]);

    const markers = await service.getIntelReportMarkers();
    expect(markers.map((m) => m.pubkey)).toEqual(['relay-polygon']);
    expect(markers[0].title).toBe('Report relay-polygon (stored)');
  });

  it('takes off a report the ingest withdrew, and a storage change does not bring it back (2 Nov key change)', async () => {
    service.addMarker(fromRelay);
    service.addMarker({ ...fromRelay, id: 'carried-copy' });
    const told: string[][] = [];
    service.subscribe((markers) => told.push(markers.map((m) => m.pubkey)));
    service.removeMarkers(['relay-polygon']);
    expect(told.at(-1)).toEqual(['carried-copy']);
    notifyStorage?.([]);
    const markers = await service.getIntelReportMarkers();
    expect(markers.map((m) => m.pubkey)).toEqual(['carried-copy']);
  });

  it('does not refetch storage again after a fetch that found nothing', async () => {
    const listReports = intelReportService.listReports as unknown as ReturnType<typeof vi.fn>;

    await service.getIntelReportMarkers();
    const afterFirst = listReports.mock.calls.length;
    await service.getIntelReportMarkers();
    await service.getIntelReportMarkers();

    expect(listReports.mock.calls.length).toBe(afterFirst);
  });
});
