/**
 * IntelWorkspaceManager — confidence scoring wiring (Phase 1 roadmap item:
 * "confidence scoring, option 2"). computeReportConfidence.test.ts already
 * covers the pure math; this verifies addReport/updateReport actually call
 * it with real workspace data, not just that the formula is correct in
 * isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntelReportData } from '../../../types/IntelWorkspace';
import type { CreateIntelItemInput } from '../../../types/intel/IntelItemUI';

function makeReportData(overrides: Partial<IntelReportData> = {}): IntelReportData {
  const now = new Date().toISOString();
  return {
    id: `report-${Math.random().toString(36).slice(2)}`,
    title: 'Test Report',
    type: 'INTEL_REPORT',
    summary: 'summary',
    content: 'Unclassified report body.',
    conclusions: [],
    recommendations: [],
    analysisType: 'GENERAL',
    methodology: [],
    confidence: 0.5,
    priority: 'ROUTINE',
    sourceIntel: [],
    author: 'tester',
    contributors: [],
    createdAt: now,
    modifiedAt: now,
    targetAudience: [],
    distributionRestrictions: [],
    relatedReports: [],
    metadata: {},
    ...overrides
  } as IntelReportData;
}

function makeIntelInput(overrides: Partial<CreateIntelItemInput> = {}): CreateIntelItemInput {
  return {
    title: 'Raw intel',
    type: 'OSINT',
    source: 'test-source',
    reliability: 'A',
    confidence: 0.5,
    tags: [],
    categories: [],
    content: 'raw content',
    ...overrides
  };
}

describe('IntelWorkspaceManager — confidence scoring wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('addReport overwrites the author-typed confidence with a derived value when sourceIntel links to real Intel', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const intel = intelWorkspaceManager.addIntelItem(makeIntelInput({ reliability: 'A' }));
    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-1',
      confidence: 0.5, // whatever the form's default was — should be overwritten
      sourceIntel: [intel.id]
    }));

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-1')!;
    expect(stored.confidence).toBe(1.0); // A-grade weight
    expect(stored.metadata.confidenceBasis).toMatchObject({ source: 'derived', sourceCount: 1 });
  });

  it('a report with no linked sources keeps whatever confidence the author entered, untouched', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-2',
      confidence: 0.73,
      sourceIntel: []
    }));

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-2')!;
    expect(stored.confidence).toBe(0.73);
    expect(stored.metadata.confidenceBasis).toBeUndefined();
  });

  it('updateReport re-derives confidence when sourceIntel changes on an existing report', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({ id: 'report-3', confidence: 0.5, sourceIntel: [] }));

    const weakIntel = intelWorkspaceManager.addIntelItem(makeIntelInput({ reliability: 'F' }));
    const current = intelWorkspaceManager.getReports().find(r => r.id === 'report-3')!;
    await intelWorkspaceManager.updateReport({ ...current, sourceIntel: [weakIntel.id] });

    const updated = intelWorkspaceManager.getReports().find(r => r.id === 'report-3')!;
    expect(updated.confidence).toBe(0.1); // F-grade weight — honestly low, not left at 0.5
  });

  it('an id that does not resolve to a real Intel item does not crash addReport and leaves the author value in place', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-4',
      confidence: 0.42,
      sourceIntel: ['does-not-exist']
    }));

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-4')!;
    expect(stored.confidence).toBe(0.42);
  });
});
