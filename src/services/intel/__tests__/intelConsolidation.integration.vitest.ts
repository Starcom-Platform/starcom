import { describe, it, expect, beforeEach } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { convertMissionToCreateIntelReportInput, convertAndStoreIntelReport } from '../../../applications/netrunner/integration/OsintIntelBridge';
import type { EnhancedMissionResult } from '../../../applications/netrunner/execution/BotMissionExecutor';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const fakeMissionResult: EnhancedMissionResult = {
  missionId: 'mission-smoke-1',
  botId: 'bot-smoke-1',
  target: 'example.com',
  status: 'success',
  intelCollected: 3,
  operationsPerformed: ['dns-lookup', 'port-scan'],
  duration: 4200,
  completedAt: Date.now(),
  errors: [],
  usedMockData: false,
  qualityScore: 82,
  confidenceLevel: 0.77,
  specializedFindings: { dns: { records: 2 } },
  toolsUsed: ['shodan', 'theharvester'],
  processingStages: ['collect', 'analyze'],
  rawDataGenerated: 5,
  observationsCreated: 2,
  correlationOpportunities: ['shared-asn-with-target-y'],
  suggestedNextActions: ['deep-scan-subdomains']
};

describe('Intel consolidation integration — canonical intelReportService, OsintIntelBridge, Nostr tag/hashtag separation', () => {
  beforeEach(async () => {
    await intelWorkspaceManager.ensureInitialized();
  });

  it('Phase 0: intelReportService.createReport persists startDate/endDate/hashtags/extra end-to-end', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-02T00:00:00.000Z');
    const created = await intelReportService.createReport({
      title: 'Smoke Test Report',
      content: 'Body',
      category: 'GENERAL',
      tags: ['smoke'],
      startDate: start,
      endDate: end,
      hashtags: ['starcom_intel', 'threat'],
      extra: { source: 'smoke-test' }
    }, 'smoke-tester');

    expect(created.id).toBeTruthy();
    expect(created.startDate?.getTime()).toBe(start.getTime());
    expect(created.endDate?.getTime()).toBe(end.getTime());
    expect(created.hashtags).toEqual(['starcom_intel', 'threat']);
    expect(created.extra).toEqual({ source: 'smoke-test' });

    // Confirm it round-trips through the real listReports() path (what IntelDashboard/marquee use)
    const all = await intelReportService.listReports();
    const found = all.find((r: IntelReportUI) => r.id === created.id);
    expect(found).toBeTruthy();
    expect(found?.hashtags).toEqual(['starcom_intel', 'threat']);
  });

  it('Phase 1: convertMissionToCreateIntelReportInput builds a valid CreateIntelReportInput from a bot mission result', () => {
    const input = convertMissionToCreateIntelReportInput(fakeMissionResult);
    expect(input.title).toContain('example.com');
    expect(input.category).toBe('OSINT_ANALYSIS');
    expect(input.tags).toEqual(['osint', 'netrunner', 'shodan', 'theharvester']);
    expect(input.extra).toMatchObject({
      missionId: 'mission-smoke-1',
      botId: 'bot-smoke-1',
      toolsUsed: ['shodan', 'theharvester']
    });
  });

  it('Phase 1: convertAndStoreIntelReport (the fixed singleton bug) writes through the canonical intelReportService and is visible via listReports()', async () => {
    const before = (await intelReportService.listReports()).length;
    const report = await convertAndStoreIntelReport(fakeMissionResult);

    expect(report.id).toBeTruthy();
    expect(report.author).toBe('netrunner-bot-bot-smoke-1');

    // This is the actual regression check for the singleton bug: since convertAndStoreIntelReport
    // now goes through intelReportService (backed by the shared intelWorkspaceManager singleton),
    // the new report must be immediately visible via listReports() — no reload needed.
    const after = await intelReportService.listReports();
    expect(after.length).toBe(before + 1);
    expect(after.some((r: IntelReportUI) => r.id === report.id)).toBe(true);
  });

  it('Phase 2: a NostrStarcomIntelIngest-shaped report (hashtags separated from tags) persists correctly via importReport', async () => {
    const now = new Date();
    const nostrShapedReport: IntelReportUI = {
      id: 'nostr-smoke-event-1',
      title: 'Nostr Smoke Report',
      content: 'Some geo-tagged content #starcom_intel #threat',
      author: 'nostr-pubkey-abc',
      category: 'GEOINT',
      tags: ['nostr', 'relay:wss://example-relay'],
      hashtags: ['starcom_intel', 'threat'],
      latitude: 12.34,
      longitude: 56.78,
      createdAt: now,
      updatedAt: now,
      status: 'SUBMITTED',
      version: 1,
      manualSummary: false,
      history: [{ action: 'IMPORTED', timestamp: now.toISOString(), user: 'nostr' }]
    };

    const imported = await intelReportService.importReport(nostrShapedReport, { strategy: 'newId' });
    expect(imported).toBeTruthy();
    expect(imported?.tags).toEqual(['nostr', 'relay:wss://example-relay']);
    expect(imported?.hashtags).toEqual(['starcom_intel', 'threat']);
    // Confirms the tag-pollution fix: hashtags must never leak into the internal `tags` taxonomy.
    expect(imported?.tags).not.toContain('starcom_intel');
  });
});
