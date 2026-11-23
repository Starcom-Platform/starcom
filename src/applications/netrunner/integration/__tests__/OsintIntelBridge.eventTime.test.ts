/**
 * An OSINT report's event time is the mission's collection window (decision D-E).
 *
 * The tools read the target's state between the start and the finish of the
 * mission, so that is when what they found held. A report carried only the time
 * it was written.
 */
import { describe, it, expect } from 'vitest';
import {
  convertMissionToIntelReport,
  convertMissionToCreateIntelReportInput,
  missionCollectionWindow,
} from '../OsintIntelBridge';
import { workspaceFileToUI } from '../../../../services/intel/adapters/reportMappers';
import type { EnhancedMissionResult } from '../../execution/BotMissionExecutor';

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

describe('OsintIntelBridge: when what the tools found held', () => {
  it('gives a new report the collection window, known to the second', () => {
    const input = convertMissionToCreateIntelReportInput(missionResult());
    expect(input.startDate?.toISOString()).toBe('2026-07-27T21:24:04.800Z');
    expect(input.endDate?.toISOString()).toBe('2026-07-27T21:24:09.000Z');
    expect(input.timePrecisionMs).toBe(1000);
  });

  it('keeps the same window in the workspace report it packages, where the workspace reads it', () => {
    const ui = workspaceFileToUI({ reportData: convertMissionToIntelReport(missionResult()) } as never);
    expect(ui.startDate?.toISOString()).toBe('2026-07-27T21:24:04.800Z');
    expect(ui.endDate?.toISOString()).toBe('2026-07-27T21:24:09.000Z');
    expect(ui.timePrecisionMs).toBe(1000);
  });

  it('gives no event time to a result without a readable finish or duration, rather than one made up from now', () => {
    const noFinish = missionResult({ completedAt: undefined as unknown as number });
    expect(missionCollectionWindow(noFinish)).toEqual({});
    expect(convertMissionToCreateIntelReportInput(noFinish).startDate).toBeUndefined();
    expect(convertMissionToIntelReport(noFinish).metadata.startDate).toBeUndefined();
    expect(missionCollectionWindow(missionResult({ duration: -1 }))).toEqual({});
  });
});
