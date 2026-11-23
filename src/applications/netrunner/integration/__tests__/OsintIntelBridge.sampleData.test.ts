/**
 * A mission whose tools answered with sample data is not collection, and the
 * bridge will not make an Intel Report from it, for the workspace or for
 * publishing. Censys answers with sample hosts when no credentials are set;
 * filed as a report, a sample reads as a finding about the target.
 */
import { describe, it, expect } from 'vitest';
import {
  convertMissionToIntelReport,
  convertMissionToCreateIntelReportInput,
  SampleDataRefusedError,
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

describe('OsintIntelBridge refuses sample data', () => {
  it('makes no report for the workspace, and names the tool', () => {
    const result = missionResult({ usedMockData: true, mockDataFrom: ['Censys'] });

    expect(() => convertMissionToCreateIntelReportInput(result)).toThrow(SampleDataRefusedError);
    expect(() => convertMissionToCreateIntelReportInput(result))
      .toThrow('Censys returned sample data, not collection, so no Intel Report was made from it');
  });

  it('makes no report for publishing either', () => {
    const result = missionResult({ usedMockData: true, mockDataFrom: ['Censys', 'VirusTotal'] });

    expect(() => convertMissionToIntelReport(result)).toThrow('Censys and VirusTotal returned sample data');
  });

  it('still refuses a result recorded before the tools were named', () => {
    const result = missionResult({ usedMockData: true });

    expect(() => convertMissionToCreateIntelReportInput(result)).toThrow('A tool returned sample data');
  });

  it('makes a report from a mission whose tools all collected', () => {
    expect(convertMissionToCreateIntelReportInput(missionResult()).title).toBe('OSINT Report: example.com');
    expect(convertMissionToIntelReport(missionResult()).title).toBe('OSINT Report: example.com');
  });
});
