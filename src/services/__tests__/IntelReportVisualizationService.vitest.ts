import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntelReportVisualizationService } from '../IntelReportVisualizationService';
import { intelReportService } from '../intel/IntelReportService';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

describe('IntelReportVisualizationService', () => {
  const svc = new IntelReportVisualizationService();
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(intelReportService, 'listReports');
    // Before, not only after. The constructor primes the cache from the real
    // store, so the FIRST test faced a cache that had already been filled —
    // with nothing — before any afterEach could run. That went unnoticed while
    // an empty cache counted as invalid and forced a refetch; it does not any
    // more, and a cached singleton has to be reset ahead of each test rather
    // than rely on one state accidentally behaving like a reset.
    svc.clearCache();
  });

  afterEach(() => {
    spy.mockRestore();
    svc.clearCache();
  });

  it('maps IntelReportUI from intelReportService into overlay markers', async () => {
    const now = new Date();
    const sample: IntelReportUI[] = [
      {
        id: 'ui-1',
        title: 'Sample A',
        content: 'Body A',
        summary: 'A',
        author: 'Tester',
        category: 'General',
        tags: ['TEST'],
        latitude: 10,
        longitude: 20,
        createdAt: now,
        updatedAt: now,
        status: 'DRAFT',
        version: 1,
        history: []
      }
    ];
    spy.mockResolvedValueOnce(sample);

    const markers = await svc.getIntelReportMarkers();
    expect(markers.length).toBe(1);
    expect(markers[0].pubkey).toBe('ui-1');
    expect(markers[0].title).toBe('Sample A');
    expect(markers[0].latitude).toBe(10);
    expect(markers[0].longitude).toBe(20);
    expect(markers[0].author).toBe('Tester');
  });

  it('returns an empty result (never fabricated data) when a fetch fails and nothing has ever loaded successfully', async () => {
    spy.mockRejectedValueOnce(new Error('network down'));

    const markers = await svc.getIntelReportMarkers();

    expect(markers).toEqual([]);
  });

  it('degrades to the last known-good (stale) cache instead of fabricating data when a later refresh fails', async () => {
    const now = new Date();
    const sample: IntelReportUI[] = [{
      id: 'stale-1',
      title: 'Stale Report',
      content: 'Body',
      summary: '',
      author: 'Tester',
      category: 'General',
      tags: ['REAL'],
      latitude: 5,
      longitude: 5,
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      version: 1,
      history: []
    }];

    spy.mockResolvedValueOnce(sample);
    const first = await svc.getIntelReportMarkers();
    expect(first.length).toBe(1);

    // Force the cache to be considered expired (without clearing it) and fail the refresh.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000); // cacheTimeout is 5 minutes
      spy.mockRejectedValueOnce(new Error('network down'));

      const second = await svc.getIntelReportMarkers();

      expect(second.length).toBe(1);
      expect(second[0].pubkey).toBe('stale-1');
      // Confirm this is really the old cached marker, not a fabricated "demo-*" one.
      expect(second[0].pubkey.startsWith('demo-')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks how many reports matched before maxReports truncated the result', async () => {
    const now = new Date();
    const sample: IntelReportUI[] = Array.from({ length: 5 }, (_, i) => ({
      id: `report-${i}`,
      title: `Report ${i}`,
      content: 'Body',
      summary: '',
      author: 'Tester',
      category: 'General',
      tags: [],
      latitude: i,
      longitude: i,
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT' as const,
      version: 1,
      history: []
    }));
    spy.mockResolvedValueOnce(sample);

    const markers = await svc.getIntelReportMarkers({ maxReports: 2 });

    expect(markers.length).toBe(2);
    expect(svc.getLastMatchingCountBeforeCap()).toBe(5);
  });

  it('reports the matching count as equal to what was returned when nothing was truncated', async () => {
    const now = new Date();
    spy.mockResolvedValueOnce([{
      id: 'only-one',
      title: 'Only Report',
      content: 'Body',
      summary: '',
      author: 'Tester',
      category: 'General',
      tags: [],
      latitude: 1,
      longitude: 1,
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      version: 1,
      history: []
    }]);

    const markers = await svc.getIntelReportMarkers({ maxReports: 25 });

    expect(markers.length).toBe(1);
    expect(svc.getLastMatchingCountBeforeCap()).toBe(1);
  });
});
