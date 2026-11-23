/**
 * syncOfflineReports has never once succeeded in the live app: it synced
 * against a Web3 IntelReportService that only ever got constructed by
 * initializeWeb3Service — which had zero real callers anywhere in src/.
 * Every sync attempt threw "Web3 service not initialized" immediately.
 * Retargeted to the canonical intelReportService (the same IndexedDB-backed
 * store every other producer in the app writes to); this covers the real
 * sync path end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineIntelReportService } from '../OfflineIntelReportService';
import { intelReportService } from '../intel/IntelReportService';
import nostrService from '../nostrService';

vi.mock('../intel/IntelReportService', () => ({
  intelReportService: {
    createReport: vi.fn(),
    listReports: vi.fn(),
  },
}));

describe('OfflineIntelReportService — sync targets the canonical store', () => {
  beforeEach(async () => {
    await offlineIntelReportService.clearAllOfflineData();
    vi.mocked(intelReportService.listReports).mockResolvedValue([]);
    vi.mocked(intelReportService.createReport).mockResolvedValue({ id: 'canonical-1' } as never);
  });

  // A fresh offline report starts at 'draft'; syncOfflineReports only picks
  // up 'pending'/'error' — this marks it pending directly, matching what a
  // real "ready to sync" UI action would do (updateOfflineReport's own
  // public signature can't express a status change: its `updates` param is
  // typed Partial<IntelReportData>, which has no status field).
  const markPending = async (offlineId: string) => {
    const report = await offlineIntelReportService.getOfflineReport(offlineId);
    await offlineIntelReportService['saveOfflineReports']([{ ...report!, status: 'pending' }]);
  };

  it('creates a real canonical report for a pending offline report and marks it synced', async () => {
    const created = await offlineIntelReportService.createOfflineReport({
      title: 'Field note',
      content: 'Observed activity',
      tags: ['SIGINT'],
      author: 'analyst-1',
    }, { lat: 10, lng: 20 });
    await markPending(created.offlineId);

    const stats = await offlineIntelReportService.syncOfflineReports();

    expect(intelReportService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Field note', content: 'Observed activity', tags: ['SIGINT'], latitude: 10, longitude: 20 }),
      'analyst-1'
    );
    expect(stats.successfulSyncs).toBe(1);
    expect(stats.failedSyncs).toBe(0);

    const synced = await offlineIntelReportService.getOfflineReport(created.offlineId);
    expect(synced?.status).toBe('synced');
  });

  it('does not require a wallet to sync — an unattributed report still reaches the canonical store', async () => {
    const created = await offlineIntelReportService.createOfflineReport({
      title: 'Anonymous field note',
      content: 'No wallet connected at capture time',
    });
    await markPending(created.offlineId);

    const stats = await offlineIntelReportService.syncOfflineReports();

    expect(intelReportService.createReport).toHaveBeenCalled();
    expect(stats.successfulSyncs).toBe(1);
  });

  // Plan item 2.2: the report is the writer's. Sync takes no wallet at all
  // since the wallet was retired (plan item 4.4).
  it('attributes a synced report to whoever wrote it', async () => {
    const created = await offlineIntelReportService.createOfflineReport({
      title: 'Written offline', content: 'Seen at the bridge', author: 'pk-writer',
    });
    await markPending(created.offlineId);

    await offlineIntelReportService.syncOfflineReports();

    expect(intelReportService.createReport).toHaveBeenCalledWith(expect.objectContaining({ title: 'Written offline' }), 'pk-writer');
  });

  it("gives a report stored under the old 'offline-user' placeholder nobody, and creates no identity to name", async () => {
    const created = await offlineIntelReportService.createOfflineReport({
      title: 'Placeholder author', content: 'Seen at the depot', author: 'offline-user',
    });
    await markPending(created.offlineId);

    await offlineIntelReportService.syncOfflineReports();

    expect(intelReportService.createReport).toHaveBeenCalledWith(expect.objectContaining({ title: 'Placeholder author' }), '');
    expect(nostrService.hasIdentity()).toBe(false);
  });
});
