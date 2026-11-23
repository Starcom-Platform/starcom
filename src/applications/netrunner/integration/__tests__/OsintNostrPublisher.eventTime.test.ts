/**
 * NetRunner's OSINT broadcasts say when what the tools found held: the
 * mission's collection window (decision D-E).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedMissionResult } from '../../execution/BotMissionExecutor';

const publishIntelReport = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/intel/NostrIntelBroadcastService', () => ({
  NostrIntelBroadcastService: class {
    publishIntelReport = publishIntelReport;
  },
}));

import { publishOsintToNostr } from '../OsintNostrPublisher';

function missionResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm-1',
    botId: 'bot-1',
    target: 'example.com',
    status: 'success',
    intelCollected: 3,
    operationsPerformed: ['scan'],
    duration: 4200,
    completedAt: Date.UTC(2026, 6, 27, 21, 24, 9),
    errors: [],
    usedMockData: false,
    qualityScore: 80,
    confidenceLevel: 70,
    specializedFindings: {},
    toolsUsed: ['shodan'],
    processingStages: ['collection'],
    rawDataGenerated: 3,
    observationsCreated: 3,
    correlationOpportunities: [],
    suggestedNextActions: [],
    ...overrides,
  };
}

describe('OsintNostrPublisher: event time', () => {
  beforeEach(() => {
    publishIntelReport.mockReset().mockResolvedValue({ success: true });
  });

  it('broadcasts the collection window with the report', async () => {
    await publishOsintToNostr(missionResult(), { ipfsCid: 'bafy-test' });

    const payload = publishIntelReport.mock.calls[0][0];
    expect(payload.startDate).toBe('2026-07-27T21:24:04.800Z');
    expect(payload.endDate).toBe('2026-07-27T21:24:09.000Z');
    expect(payload.timePrecisionMs).toBe(1000);
  });

  it('broadcasts no event time for a result without a readable finish', async () => {
    await publishOsintToNostr(missionResult({ completedAt: undefined as unknown as number }), { ipfsCid: 'bafy-test' });

    const payload = publishIntelReport.mock.calls[0][0];
    expect(payload.startDate).toBeUndefined();
    expect(payload.timePrecisionMs).toBeUndefined();
  });
});
