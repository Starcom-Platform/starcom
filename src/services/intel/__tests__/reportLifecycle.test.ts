import { describe, it, expect } from 'vitest';
import { computeChangedFields, nextVersion, makeHistoryEntry } from '../reportLifecycle';
import { IntelReportUI } from '../../../types/intel/IntelReportUI';

function baseReport(): IntelReportUI {
  const now = new Date();
  return {
    id: 'r1',
    title: 'Title',
    content: 'Body',
    author: 'author',
    category: 'cat',
    tags: ['a'],
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    conclusions: [],
    recommendations: [],
    methodology: [],
    targetAudience: [],
    sourceIntelIds: [],
    version: 1,
    history: []
  };
}

describe('reportLifecycle helpers', () => {
  it('computeChangedFields none when identical', () => {
    const r1 = baseReport();
    const r2 = { ...r1 };
    expect(computeChangedFields(r1, r2)).toEqual([]);
  });
  it('computeChangedFields detects field changes', () => {
    const r1 = baseReport();
    const r2 = { ...r1, title: 'New Title', tags: ['a','b'] };
    const changes = computeChangedFields(r1, r2).sort();
    expect(changes).toEqual(['tags','title'].sort());
  });
  // A change of distribution or of how a report is kept at rest is a change: it
  // was left out, so a save that changed only these returned "nothing to do"
  // and stored nothing (found by plan item 9.6's check in a browser).
  it('computeChangedFields detects a change of distribution or sensitivity', () => {
    const r1 = { ...baseReport(), visibility: 'public', sensitivity: 'open' } as IntelReportUI;
    expect(computeChangedFields(r1, { ...r1, visibility: 'private' } as IntelReportUI)).toEqual(['visibility']);
    expect(computeChangedFields(r1, { ...r1, sensitivity: 'protected' } as IntelReportUI)).toEqual(['sensitivity']);
  });
  it('nextVersion increments when changes present', () => {
    const r1 = baseReport();
    const v = nextVersion(r1, ['title'], false);
    expect(v).toBe((r1.version || 1) + 1);
  });
  it('nextVersion increments when status changes even with no field changes', () => {
    const r1 = baseReport();
    const v = nextVersion(r1, [], true, 'SUBMITTED');
    expect(v).toBe((r1.version || 1) + 1);
  });
  it('nextVersion unchanged with no changes or status change', () => {
    const r1 = baseReport();
    const v = nextVersion(r1, [], false);
    expect(v).toBe(r1.version);
  });
  it('makeHistoryEntry uses provided timestamp', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const entry = makeHistoryEntry({ action: 'UPDATED', timestamp: ts });
    expect(entry.timestamp).toBe(ts);
  });
  // Cycle 2: collaborators is an array of objects, not primitives. A naive .join()
  // comparison stringifies every element to "[object Object]" and reports arrays of
  // equal length as identical regardless of content — this would have silently made
  // ReportDetailPanel's "Add collaborator" a no-op (saveReport bails out early on
  // "nothing to do"). This test fails against that comparison style and passes against
  // the JSON.stringify-based one.
  it('computeChangedFields detects a collaborator being added', () => {
    const r1 = baseReport();
    const r2 = {
      ...r1,
      collaborators: [{ userId: 'pk1', name: 'Mecha Jono', role: 'VIEWER' as const, addedAt: '2024-01-01T00:00:00.000Z', addedBy: 'author' }]
    };
    expect(computeChangedFields(r1, r2)).toContain('collaborators');
  });
  it('computeChangedFields sees no change when collaborators are identical', () => {
    const collaborators = [{ userId: 'pk1', name: 'Mecha Jono', role: 'VIEWER' as const, addedAt: '2024-01-01T00:00:00.000Z', addedBy: 'author' }];
    const r1 = { ...baseReport(), collaborators };
    const r2 = { ...baseReport(), collaborators: [...collaborators] };
    expect(computeChangedFields(r1, r2)).toEqual([]);
  });
});
