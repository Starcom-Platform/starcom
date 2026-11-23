/**
 * The unit seam between NetRunner and the intel workspace.
 *
 * BotMissionExecutor emits confidence on 0-100; every reader of a report's
 * `confidence` renders it as `confidence * 100`. The bridge passed the number
 * through unchanged, so each report NetRunner filed displayed "7000% conf" —
 * shipped, visible on the workspace console, and caught by nothing, because the
 * one fixture that touched confidence used 0.8 and so sat on the far side of the
 * seam without ever crossing it.
 *
 * These assert the boundary in the executor's own terms rather than a tidy
 * number: 70 is the value assessIntelligenceQuality actually defaults to.
 */
import { describe, it, expect } from 'vitest';
import {
  convertMissionToIntelReport,
  convertMissionToCreateIntelReportInput,
} from '../OsintIntelBridge';
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
    completedAt: 1_700_000_000_000,
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

describe('OsintIntelBridge confidence scale', () => {
  it('converts the executor 0-100 confidence to the 0-1 reports are read on', () => {
    expect(convertMissionToIntelReport(missionResult()).confidence).toBeCloseTo(0.7);
    expect(convertMissionToCreateIntelReportInput(missionResult()).confidence).toBeCloseTo(0.7);
  });

  it('never emits a confidence above 1, whatever the executor reports', () => {
    for (const level of [0, 55, 70, 100]) {
      const report = convertMissionToIntelReport(missionResult({ confidenceLevel: level }));
      expect(report.confidence).toBeGreaterThanOrEqual(0);
      expect(report.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('renders the percentage once, not twice, in the prose it writes', () => {
    const report = convertMissionToIntelReport(missionResult());
    expect(report.summary).toContain('confidence: 70%');
    expect(report.content).toContain('**Confidence:** 70%');
    expect(`${report.summary}${report.content}`).not.toContain('7000');
  });
});
