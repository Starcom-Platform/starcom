/**
 * Changing a record's distribution from the attention queue (plan item 9.6),
 * against the real services and storage. The queue retires an item only once
 * the record says so: a change that did not save must say so, since the
 * record would still be Public while the queue showed it handled.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';

const MADE = '2026-09-03T10:00:00.000Z';
const base = { assignedTo: [], relatedEntities: [], relatedCases: [], tags: [], metadata: {}, createdBy: 'a', activityLog: [], collaborators: [], permissions: { canEdit: [], canView: [], canDelete: [] } };

function seed() {
  localStorage.setItem('intelWorkspace.v1', JSON.stringify({
    version: 2, intel: [], packages: [], metadata: { createdAt: MADE },
    cases: [{ ...base, id: 'c1', caseNumber: 'CASE-1', title: 'Harbour cranes', description: 'd', status: 'OPEN', priority: 'MEDIUM', startDate: MADE, createdAt: MADE, updatedAt: MADE, visibility: 'public', sensitivity: 'open' }],
    missions: [
      { ...base, id: 'm1', missionNumber: 'MSN-1', title: 'Coastal survey', briefing: 'b', status: 'PLANNING', objectives: [], startDate: MADE, relatedReports: [], createdAt: MADE, updatedAt: MADE, visibility: 'public', sensitivity: 'open' },
      { ...base, id: 'm2', missionNumber: 'MSN-2', title: 'Locked survey', briefing: 'b', status: 'READY_FOR_PACKAGE', objectives: [], startDate: MADE, relatedReports: [], createdAt: MADE, updatedAt: MADE, visibility: 'public', sensitivity: 'open' },
    ],
    reports: [{
      id: 'r1', title: 'Berth 4 photos', type: 'INTEL_REPORT', summary: 's', content: 'body', conclusions: [], recommendations: [], analysisType: 'GENERAL',
      methodology: [], confidence: 0.5, priority: 'ROUTINE', sourceIntel: [], author: 'a', contributors: [], createdAt: MADE, modifiedAt: MADE,
      targetAudience: [], distributionRestrictions: [], relatedReports: [], metadata: { visibility: 'public', sensitivity: 'open' },
    }],
  }));
}

/** The workspace the last test loaded, whose save may still be waiting out its 300 ms debounce. */
let loadedWorkspace: { flushPendingSave(): void } | null = null;

async function load() {
  const { setRecordDistribution } = await import('../setRecordDistribution');
  loadedWorkspace = (await import('../../IntelWorkspaceManager')).intelWorkspaceManager;
  const { intelCaseService } = await import('../../IntelCaseService');
  const { missionService } = await import('../../MissionService');
  const { intelReportService } = await import('../../IntelReportService');
  return { setRecordDistribution, intelCaseService, missionService, intelReportService };
}

describe('setRecordDistribution', () => {
  beforeEach(() => {
    /*
     * Written now, before the reseed below, rather than after it. A test's
     * save waits 300 ms, and on a loaded machine it landed during a later
     * test, whose fresh workspace then read the earlier test's change: the
     * save stubbed out below read as held, and the test failed now and then.
     */
    loadedWorkspace?.flushPendingSave();
    loadedWorkspace = null;
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    seed();
  });

  it('changes a case, a mission and a report, and each record holds it', async () => {
    const { setRecordDistribution, intelCaseService, missionService, intelReportService } = await load();
    await setRecordDistribution({ kind: 'case', id: 'c1' }, 'private');
    await setRecordDistribution({ kind: 'mission', id: 'm1' }, 'limited');
    await setRecordDistribution({ kind: 'report', id: 'r1' }, 'private');
    expect((await intelCaseService.getCase('c1'))?.visibility).toBe('private');
    expect((await missionService.getMission('m1'))?.visibility).toBe('limited');
    expect((await intelReportService.getReport('r1'))?.visibility).toBe('private');
  });

  it('refuses a mission whose package is locked, and leaves it Public', async () => {
    const { setRecordDistribution, missionService } = await load();
    await expect(setRecordDistribution({ kind: 'mission', id: 'm2' }, 'private')).rejects.toThrow(/locked/);
    expect((await missionService.getMission('m2'))?.visibility).toBe('public');
  });

  it('says so when a save returned but the record does not hold the change', async () => {
    const { setRecordDistribution, intelReportService } = await load();
    vi.spyOn(intelReportService, 'saveReport').mockResolvedValue(undefined);
    await expect(setRecordDistribution({ kind: 'report', id: 'r1' }, 'private')).rejects.toThrow('the change did not save');
  });

  it('says so when the record is gone', async () => {
    const { setRecordDistribution } = await load();
    await expect(setRecordDistribution({ kind: 'case', id: 'nope' }, 'private')).rejects.toThrow('the case is no longer here');
  });
});
