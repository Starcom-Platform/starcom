/**
 * CaseManagerAdapter — CRUD/stats/filter surface. The collaboration half
 * (comments, collaborators, permissions, sharing tokens) is covered by
 * ../../tests/caseManagerCollaboration.test.ts; this file covers everything
 * that test file doesn't: getCases/getCaseStats/getCaseById/addCase/
 * updateCase/deleteCase/linkEntitiesToCase/linkCases, and the filter
 * operators in the adapter's own matchesFilter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntelCaseUI } from '../../../../types/intel/IntelCaseUI';

const { getCase, saveCase, listCases, createCase, updateStatus, deleteCase } = vi.hoisted(() => ({
  getCase: vi.fn(),
  saveCase: vi.fn(),
  listCases: vi.fn(),
  createCase: vi.fn(),
  updateStatus: vi.fn(),
  deleteCase: vi.fn()
}));

vi.mock('../../../../services/intel/IntelCaseService', () => ({
  intelCaseService: { getCase, saveCase, listCases, createCase, updateStatus, deleteCase }
}));

vi.mock('../../events/enhancedEventEmitter', () => ({
  enhancedEventEmitter: { emit: vi.fn(), on: vi.fn(() => ({ unsubscribe: vi.fn() })) }
}));

import { nostrIdentityService } from '../../../../services/identity/NostrIdentityService';
import { caseManagerAdapter } from '../caseManagerAdapter';
import { enhancedEventEmitter } from '../../events/enhancedEventEmitter';

function makeCase(overrides: Partial<IntelCaseUI> = {}): IntelCaseUI {
  return {
    id: 'case-1',
    caseNumber: 'CASE-2026-0001',
    title: 'Test Case',
    description: 'A case for testing',
    status: 'OPEN' as IntelCaseUI['status'],
    priority: 'MEDIUM' as IntelCaseUI['priority'],
    assignedTo: [],
    startDate: '2026-01-01T00:00:00.000Z',
    relatedEntities: [],
    relatedCases: [],
    tags: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'operative',
    collaborators: [],
    comments: [],
    activityLog: [],
    permissions: {
      isPublic: false
    },
    ...overrides
  };
}

describe('CaseManagerAdapter — CRUD/stats/filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCase.mockReset().mockResolvedValue(null);
    saveCase.mockReset().mockResolvedValue(undefined);
    listCases.mockReset().mockResolvedValue([]);
    createCase.mockReset();
    updateStatus.mockReset();
    deleteCase.mockReset().mockResolvedValue(undefined);
  });

  describe('getCases', () => {
    it('transforms IntelCaseUI records into CaseItem and sorts by startDate desc', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', startDate: '2026-01-01T00:00:00.000Z' }),
        makeCase({ id: 'b', startDate: '2026-03-01T00:00:00.000Z' })
      ]);

      const cases = await caseManagerAdapter.getCases();

      expect(cases).toHaveLength(2);
      expect(cases[0].id).toBe('b'); // most recent first
      expect(cases[0].startDate).toBeInstanceOf(Date);
    });

    it('filters with "equals"', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', priority: 'HIGH' as IntelCaseUI['priority'] }),
        makeCase({ id: 'b', priority: 'LOW' as IntelCaseUI['priority'] })
      ]);
      const cases = await caseManagerAdapter.getCases([{ property: 'priority', operator: 'equals', value: 'HIGH' }]);
      expect(cases.map(c => c.id)).toEqual(['a']);
    });

    it('filters with "contains" on a string field', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', title: 'Phishing Campaign' }),
        makeCase({ id: 'b', title: 'Malware Analysis' })
      ]);
      const cases = await caseManagerAdapter.getCases([{ property: 'title', operator: 'contains', value: 'phish' }]);
      expect(cases.map(c => c.id)).toEqual(['a']);
    });

    it('filters with "contains" on an array field', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', tags: ['urgent', 'phishing'] }),
        makeCase({ id: 'b', tags: ['low-priority'] })
      ]);
      const cases = await caseManagerAdapter.getCases([{ property: 'tags', operator: 'contains', value: 'urgent' }]);
      expect(cases.map(c => c.id)).toEqual(['a']);
    });

    it('filters with "startsWith" and "endsWith"', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', caseNumber: 'CASE-2026-0001' }),
        makeCase({ id: 'b', caseNumber: 'CASE-2025-0099' })
      ]);
      const starts = await caseManagerAdapter.getCases([{ property: 'caseNumber', operator: 'startsWith', value: 'CASE-2026' }]);
      expect(starts.map(c => c.id)).toEqual(['a']);

      const ends = await caseManagerAdapter.getCases([{ property: 'caseNumber', operator: 'endsWith', value: '0099' }]);
      expect(ends.map(c => c.id)).toEqual(['b']);
    });

    it('filters with "before", "after" and "between" on Date fields', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', startDate: '2026-01-01T00:00:00.000Z' }),
        makeCase({ id: 'b', startDate: '2026-06-01T00:00:00.000Z' }),
        makeCase({ id: 'c', startDate: '2026-12-01T00:00:00.000Z' })
      ]);

      const before = await caseManagerAdapter.getCases([
        { property: 'startDate', operator: 'before', value: new Date('2026-03-01') }
      ]);
      expect(before.map(c => c.id)).toEqual(['a']);

      const after = await caseManagerAdapter.getCases([
        { property: 'startDate', operator: 'after', value: new Date('2026-09-01') }
      ]);
      expect(after.map(c => c.id)).toEqual(['c']);

      const between = await caseManagerAdapter.getCases([
        { property: 'startDate', operator: 'between', value: [new Date('2026-02-01'), new Date('2026-07-01')] }
      ]);
      expect(between.map(c => c.id)).toEqual(['b']);
    });

    it('returns an empty list rather than throwing when the underlying service rejects', async () => {
      listCases.mockRejectedValue(new Error('storage unavailable'));
      await expect(caseManagerAdapter.getCases()).rejects.toThrow();
    });
  });

  describe('getCaseStats', () => {
    it('aggregates byStatus/byPriority counts', async () => {
      listCases.mockResolvedValue([
        makeCase({ id: 'a', status: 'OPEN' as IntelCaseUI['status'], priority: 'HIGH' as IntelCaseUI['priority'] }),
        makeCase({ id: 'b', status: 'OPEN' as IntelCaseUI['status'], priority: 'LOW' as IntelCaseUI['priority'] }),
        makeCase({
          id: 'c', status: 'CLOSED' as IntelCaseUI['status'], priority: 'HIGH' as IntelCaseUI['priority'],
          closedDate: '2026-01-05T00:00:00.000Z'
        })
      ]);

      const stats = await caseManagerAdapter.getCaseStats();
      expect(stats.totalCases).toBe(3);
      expect(stats.byStatus).toEqual({ OPEN: 2, CLOSED: 1 });
      expect(stats.byPriority).toEqual({ HIGH: 2, LOW: 1 });
      expect(stats.closedCases).toBe(1);
      expect(stats.openCases).toBe(2);
    });

    it('counts a case as open, on hold or closed by its status, as the Cases tabs group it (plan item 1.8)', async () => {
      // "Open" was every case with no closedDate: a resolved case was open, and
      // a closed case reopened kept its closedDate and stayed closed.
      const status = (s: string) => s as IntelCaseUI['status'];
      listCases.mockResolvedValue([
        makeCase({ id: 'new', status: status('NEW') }),
        makeCase({ id: 'worked', status: status('IN_PROGRESS') }),
        makeCase({ id: 'held', status: status('PENDING') }),
        makeCase({ id: 'resolved', status: status('RESOLVED') }),
        makeCase({ id: 'closed', status: status('CLOSED'), closedDate: '2026-01-05T00:00:00.000Z' }),
        makeCase({ id: 'reopened', status: status('OPEN'), closedDate: '2026-01-05T00:00:00.000Z' }),
      ]);
      const stats = await caseManagerAdapter.getCaseStats();
      expect({ open: stats.openCases, onHold: stats.onHoldCases, closed: stats.closedCases, total: stats.totalCases })
        .toEqual({ open: 3, onHold: 1, closed: 2, total: 6 });
    });

    it('computes avgTimeToClose in days across closed cases', async () => {
      listCases.mockResolvedValue([
        makeCase({
          id: 'a',
          startDate: '2026-01-01T00:00:00.000Z',
          closedDate: '2026-01-03T00:00:00.000Z' // 2 days
        }),
        makeCase({
          id: 'b',
          startDate: '2026-01-01T00:00:00.000Z',
          closedDate: '2026-01-05T00:00:00.000Z' // 4 days
        })
      ]);

      const stats = await caseManagerAdapter.getCaseStats();
      expect(stats.avgTimeToClose).toBe(3); // (2 + 4) / 2
    });

    it('floors a negative time-to-close (bad data: closedDate before startDate) at zero instead of skewing the average negative', async () => {
      listCases.mockResolvedValue([
        makeCase({
          id: 'a',
          startDate: '2026-01-10T00:00:00.000Z',
          closedDate: '2026-01-01T00:00:00.000Z' // closed "before" it started — bad data
        }),
        makeCase({
          id: 'b',
          startDate: '2026-01-01T00:00:00.000Z',
          closedDate: '2026-01-05T00:00:00.000Z' // 4 real days
        })
      ]);

      const stats = await caseManagerAdapter.getCaseStats();
      // Without the floor this would be (-9 + 4) / 2 = -2.5. With it, (0 + 4) / 2 = 2.
      expect(stats.avgTimeToClose).toBe(2);
    });

    it('returns null avgTimeToClose when no cases are closed', async () => {
      listCases.mockResolvedValue([makeCase({ id: 'a' })]);
      const stats = await caseManagerAdapter.getCaseStats();
      expect(stats.avgTimeToClose).toBeNull();
    });
  });

  describe('getCaseById', () => {
    it('returns null for a case that does not exist', async () => {
      getCase.mockResolvedValue(null);
      const result = await caseManagerAdapter.getCaseById('missing');
      expect(result).toBeNull();
    });

    it('returns the transformed case when found', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', title: 'Found Case' }));
      const result = await caseManagerAdapter.getCaseById('case-1');
      expect(result?.title).toBe('Found Case');
    });

    it('carries the team relays a Limited case also goes to, so where it goes reads them (LW1)', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', visibility: 'limited', limitedTo: ['wss://relay.team.example'] }));
      expect((await caseManagerAdapter.getCaseById('case-1'))?.limitedTo).toEqual(['wss://relay.team.example']);
      getCase.mockResolvedValue(makeCase({ id: 'case-2' }));
      expect(await caseManagerAdapter.getCaseById('case-2')).not.toHaveProperty('limitedTo');
    });
  });

  describe('addCase', () => {
    it('refuses to create a case with no title/description', async () => {
      const id = await caseManagerAdapter.addCase({ title: 'Only a title' });
      expect(id).toBeNull();
      expect(createCase).not.toHaveBeenCalled();
    });

    it('creates a Limited case with the teams picked for it (LW1)', async () => {
      createCase.mockResolvedValue(makeCase({ id: 'new-case' }));
      await caseManagerAdapter.addCase({ title: 'New Case', description: 'desc', visibility: 'limited', limitedTo: ['wss://relay.team.example'] });
      expect(createCase).toHaveBeenLastCalledWith(expect.objectContaining({ limitedTo: ['wss://relay.team.example'] }));
    });

    it('creates a real case and returns its id (not the full CaseItem)', async () => {
      createCase.mockResolvedValue(makeCase({ id: 'new-case' }));
      const id = await caseManagerAdapter.addCase({ title: 'New Case', description: 'desc' });

      expect(id).toBe('new-case');
      expect(createCase).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Case', description: 'desc' }));
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:created', expect.objectContaining({ caseId: 'new-case' }));
    });

    it('passes through demo-data-generator-style overrides (startDate/status/closedDate/caseNumber/metadata)', async () => {
      createCase.mockResolvedValue(makeCase({ id: 'seeded-case' }));

      await caseManagerAdapter.addCase({
        title: 'Seeded Case',
        description: 'From caseDataGenerator',
        startDate: '2025-11-01T00:00:00.000Z',
        status: 'CLOSED' as IntelCaseUI['status'],
        closedDate: '2025-11-20T00:00:00.000Z',
        caseNumber: 'CASE-2025-9999',
        metadata: { source: 'operation-blackout' },
        createdBy: 'intel-analyst'
      } as never);

      expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
        startDate: '2025-11-01T00:00:00.000Z',
        status: 'CLOSED',
        closedDate: '2025-11-20T00:00:00.000Z',
        caseNumber: 'CASE-2025-9999',
        metadata: { source: 'operation-blackout' },
        // Dropped, the workspace would ensure a signing identity for a seeded case.
        createdBy: 'intel-analyst'
      }));
    });
  });

  describe('updateCase', () => {
    it('returns false for a case that does not exist', async () => {
      getCase.mockResolvedValue(null);
      const result = await caseManagerAdapter.updateCase('missing', { title: 'x' });
      expect(result).toBe(false);
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('updates non-status fields and emits case:updated', async () => {
      const current = makeCase({ id: 'case-1' });
      getCase.mockResolvedValue(current);
      saveCase.mockImplementation(() => Promise.resolve());

      const result = await caseManagerAdapter.updateCase('case-1', { title: 'Renamed', tags: ['renamed'] });

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed', tags: ['renamed'] }));
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:updated', expect.objectContaining({ caseId: 'case-1' }));
    });

    it('saves the teams picked for a Limited case, and keeps them when an edit does not say (LW1)', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', visibility: 'limited', limitedTo: ['wss://relay.team.example'] }));
      saveCase.mockImplementation(() => Promise.resolve());
      await caseManagerAdapter.updateCase('case-1', { title: 'Renamed' });
      expect(saveCase).toHaveBeenLastCalledWith(expect.objectContaining({ limitedTo: ['wss://relay.team.example'] }));
      await caseManagerAdapter.updateCase('case-1', { limitedTo: [] });
      expect(saveCase).toHaveBeenLastCalledWith(expect.objectContaining({ limitedTo: [] }));
    });

    it('routes a status change through the validated updateStatus transition', async () => {
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockResolvedValue(makeCase({ id: 'case-1', status: 'IN_PROGRESS' as IntelCaseUI['status'] }));

      const result = await caseManagerAdapter.updateCase('case-1', { status: 'IN_PROGRESS' as IntelCaseUI['status'] } as never);

      expect(updateStatus).toHaveBeenCalledWith('case-1', 'IN_PROGRESS');
      expect(result).toBe(true);
    });

    it('propagates a rejected (invalid) status transition rather than silently overwriting it', async () => {
      const current = makeCase({ id: 'case-1', status: 'NEW' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockRejectedValue(new Error('Invalid case status transition: NEW -> RESOLVED'));

      await expect(
        caseManagerAdapter.updateCase('case-1', { status: 'RESOLVED' as IntelCaseUI['status'] } as never)
      ).rejects.toThrow('Invalid case status transition');
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('records who changed the status as a STATUS_CHANGED activity entry when an actorId is provided', async () => {
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockResolvedValue(makeCase({ id: 'case-1', status: 'IN_PROGRESS' as IntelCaseUI['status'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.updateCase('case-1', { status: 'IN_PROGRESS' as IntelCaseUI['status'] } as never, 'analyst-pubkey-abc');

      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({
        activityLog: expect.arrayContaining([
          expect.objectContaining({ action: 'STATUS_CHANGED', userId: 'analyst-pubkey-abc' })
        ])
      }));
    });

    /*
     * This block used to assert that NO entry was written without an actorId,
     * under the heading "not a fabricated one". The intent was right and is
     * kept — never invent an actor — but discarding the whole event was the
     * wrong way to honour it, and it had a real consequence: the hook's
     * interface did not even expose actorId, so no caller ever passed one and a
     * case's status history was never recorded at all.
     *
     * replayCase can represent "this happened, attributed to nobody" — that is
     * what its `unattributed` list is for, and rule 1 of its header. It cannot
     * represent an event that was never written. So losing the event is
     * strictly worse than recording it with an honest empty actor.
     */
    it('still records the status change when no actorId is passed, attributed to the current identity', async () => {
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockResolvedValue(makeCase({ id: 'case-1', status: 'IN_PROGRESS' as IntelCaseUI['status'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.updateCase('case-1', { status: 'IN_PROGRESS' as IntelCaseUI['status'] } as never);

      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({
        activityLog: expect.arrayContaining([
          expect.objectContaining({ action: 'STATUS_CHANGED', details: { from: 'OPEN', to: 'IN_PROGRESS' } })
        ])
      }));
    });

    // Attribution reads who signs (plan item 2.2): with an extension, its key.
    it('attributes to whoever signs', async () => {
      vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue('f'.repeat(64));
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockResolvedValue(makeCase({ id: 'case-1', status: 'IN_PROGRESS' as IntelCaseUI['status'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.updateCase('case-1', { status: 'IN_PROGRESS' as IntelCaseUI['status'] } as never);

      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({
        activityLog: expect.arrayContaining([
          expect.objectContaining({ action: 'STATUS_CHANGED', userId: 'f'.repeat(64) })
        ])
      }));
    });

    it('attributes to nobody rather than a placeholder when there is no identity at all', async () => {
      vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(null);
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      updateStatus.mockResolvedValue(makeCase({ id: 'case-1', status: 'IN_PROGRESS' as IntelCaseUI['status'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.updateCase('case-1', { status: 'IN_PROGRESS' as IntelCaseUI['status'] } as never);

      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({
        activityLog: expect.arrayContaining([
          expect.objectContaining({ action: 'STATUS_CHANGED', userId: '' })
        ])
      }));
    });

    it('does not log a STATUS_CHANGED entry for a non-status update, even with an actorId provided', async () => {
      const current = makeCase({ id: 'case-1', status: 'OPEN' as IntelCaseUI['status'] });
      getCase.mockResolvedValue(current);
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.updateCase('case-1', { title: 'Renamed' }, 'analyst-pubkey-abc');

      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({ activityLog: [] }));
    });
  });

  describe('deleteCase', () => {
    it('returns false for a case that does not exist', async () => {
      getCase.mockResolvedValue(null);
      const result = await caseManagerAdapter.deleteCase('missing');
      expect(result).toBe(false);
      expect(deleteCase).not.toHaveBeenCalled();
    });

    it('deletes an existing case and emits case:deleted with just the id', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      const result = await caseManagerAdapter.deleteCase('case-1');
      expect(result).toBe(true);
      // With what to do if Undo brings it back (plan item 0.6).
      expect(deleteCase).toHaveBeenCalledWith('case-1', expect.any(Function));
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:deleted', { caseId: 'case-1' });
    });

    it('on Undo, logs RESTORED with when it was deleted, and tells the screens the case is back', async () => {
      const restored = makeCase({ id: 'case-1' });
      getCase.mockResolvedValue(restored);
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.deleteCase('case-1');
      const onRestored = deleteCase.mock.calls[0][1] as (c: IntelCaseUI, deletedAt: string) => Promise<void>;

      await onRestored(restored, '2026-09-27T01:00:00.000Z');

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.activityLog.at(-1)).toMatchObject({ action: 'RESTORED', details: { deletedAt: '2026-09-27T01:00:00.000Z' } });
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:created', expect.objectContaining({ caseId: 'case-1' }));
    });
  });

  describe('position — what the case concludes', () => {
    it('records the statement, the adjudicator and the time', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);

      const ok = await caseManagerAdapter.statePosition('case-1', '  The vessel changed registry twice.  ');

      expect(ok).toBe(true);
      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.position?.statement).toBe('The vessel changed registry twice.');
      expect(saved.position?.adjudicatedAt).toBeTruthy();
    });

    it('carries NO confidence figure — weight is derived, never asserted', async () => {
      // The network ratified this: a number the adjudicator picks adds nothing
      // a consumer can verify. The method is the case — its members, its
      // contradictions, its adjudicator — all already recorded.
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.statePosition('case-1', 'A position.', 'substantiated');

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.position).not.toHaveProperty('confidence');
      // `verdict` is here and is NOT a confidence. It states what the evidence
      // was found to do, which is the conclusion the case was opened to reach;
      // a confidence would be the adjudicator grading that conclusion, which
      // is the part a consumer cannot check and therefore must not be sent.
      expect(Object.keys(saved.position!).sort()).toEqual(
        ['adjudicatedAt', 'adjudicatedBy', 'statement', 'verdict'],
      );
    });

    it('drops an "addressed" note with no words in it', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', contradictedBy: ['ent-9'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.statePosition('case-1', 'A position.', 'inconclusive', {
        'ent-9': '   ',
      });

      // A key with nothing behind it is the tick this field exists to refuse.
      // Kept, it would let an unaddressed contradiction be counted as answered
      // in the published method.
      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.position).not.toHaveProperty('addressed');
    });

    it('ignores an "addressed" note for a contradiction the case does not carry', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', contradictedBy: ['ent-9'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.statePosition('case-1', 'A position.', 'substantiated', {
        'ent-9': 'the second sighting was 40km off',
        'ent-not-linked': 'answered something nobody raised',
      });

      // Otherwise the count published later overstates the work done.
      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(Object.keys(saved.position!.addressed!)).toEqual(['ent-9']);
    });

  });

  describe('collection requirements — what the case still needs', () => {
    it('refuses a requirement nobody can justify', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);
      // A question with no stated decision behind it is a wish. The queue a
      // collector reads is only worth reading if every line says what turns on
      // the answer.
      expect(await caseManagerAdapter.raiseRequirement('case-1', 'Who owns Acme?', '   ')).toBeNull();
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('records a requirement as unanswered, never as partly satisfied', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.raiseRequirement('case-1', 'Who owns Acme?', 'The mission needs a responsible party.');

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      const req = saved.requirements![0];
      expect(req.answeredBy).toEqual([]);
      // No percentSatisfied, no rating, no approval state. Satisfaction is
      // derived from linked evidence at read time.
      expect(req).not.toHaveProperty('percentSatisfied');
      expect(req).not.toHaveProperty('status');
    });

    it('drops a field ask it cannot use rather than carrying it', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.raiseRequirement(
        'case-1', 'Is the north gate manned overnight?', 'The approach plan assumes it is not.',
        undefined,
        // A modality outside the field vocabulary, and a geohash finer than the
        // ingest side accepts. The caller is a form today and could be a peer
        // tomorrow; neither is trusted.
        { modality: ['saw', 'telepathy'], geohash: 'u4pruy' },
      );

      const req = (saveCase.mock.calls[0][0] as IntelCaseUI).requirements![0];
      expect(req.modality).toEqual(['saw']);
      // Absent, not corrected. A cell nobody meant would show in the queue as a
      // place to go, which is worse than showing no place at all.
      expect(req.place).toBeUndefined();
    });

    it('carries a usable field ask through unchanged', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.raiseRequirement(
        'case-1', 'Is the north gate manned overnight?', 'The approach plan assumes it is not.',
        undefined, { modality: ['saw', 'told'], geohash: 'U4PR' },
      );

      const req = (saveCase.mock.calls[0][0] as IntelCaseUI).requirements![0];
      expect(req.modality).toEqual(['saw', 'told']);
      expect(req.place).toEqual({ geohash: 'u4pr' });
    });

    it('leaves a desk question with no field ask at all', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.raiseRequirement(
        'case-1', "Who are Acme's registered directors?", 'The mission needs a responsible party.',
      );

      const req = (saveCase.mock.calls[0][0] as IntelCaseUI).requirements![0];
      // Most requirements are answered from a register. Absent fields say so;
      // a default of "anyone could go and look" would fill a dispatch queue
      // with trips nobody needs to make.
      expect(req.modality).toBeUndefined();
      expect(req.place).toBeUndefined();
    });

    it('records an offered answer as a link, not as a settlement', async () => {
      const existing = makeCase({
        id: 'case-1',
        requirements: [{
          id: 'req-1', question: 'q', because: 'b',
          raisedBy: 'a', raisedAt: '2026-08-01T00:00:00.000Z', answeredBy: [],
        }],
      });
      getCase.mockResolvedValue(existing);
      saveCase.mockResolvedValue(undefined);

      expect(await caseManagerAdapter.answerRequirement('case-1', 'req-1', 'report-9')).toBe(true);
      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      // Nothing here says "answered". Whether it counts depends on that
      // report's lifecycle stage, read fresh every time.
      expect(saved.requirements![0].answeredBy).toEqual(['report-9']);
      expect(saved.requirements![0]).not.toHaveProperty('closed');
    });

    it('does not offer the same report twice', async () => {
      getCase.mockResolvedValue(makeCase({
        id: 'case-1',
        requirements: [{
          id: 'req-1', question: 'q', because: 'b',
          raisedBy: 'a', raisedAt: '2026-08-01T00:00:00.000Z', answeredBy: ['report-9'],
        }],
      }));
      expect(await caseManagerAdapter.answerRequirement('case-1', 'req-1', 'report-9')).toBe(false);
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('refuses to withdraw a requirement without saying why', async () => {
      getCase.mockResolvedValue(makeCase({
        id: 'case-1',
        requirements: [{
          id: 'req-1', question: 'q', because: 'b',
          raisedBy: 'a', raisedAt: '2026-08-01T00:00:00.000Z', answeredBy: [],
        }],
      }));
      // Dropped without a reason, it looks identical to one that was decided.
      expect(await caseManagerAdapter.closeRequirement('case-1', 'req-1', '  ')).toBe(false);
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('keeps the withdrawal reason with the requirement', async () => {
      getCase.mockResolvedValue(makeCase({
        id: 'case-1',
        requirements: [{
          id: 'req-1', question: 'q', because: 'b',
          raisedBy: 'a', raisedAt: '2026-08-01T00:00:00.000Z', answeredBy: [],
        }],
      }));
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.closeRequirement('case-1', 'req-1', 'answered by a different case');

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.requirements![0].closed?.reason).toBe('answered by a different case');
    });
  });

  describe('position', () => {
    it('logs what the position rested on AT THE TIME', async () => {
      // Not what the case happens to hold when the log is read later — a
      // position that looked well-supported when taken and thin afterwards is
      // exactly what a replay needs to show.
      getCase.mockResolvedValue(makeCase({
        id: 'case-1', relatedEntities: ['e1', 'e2'], contradictedBy: ['x1'],
      }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.statePosition('case-1', 'Concluded.', 'substantiated');

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      const entry = saved.activityLog.find((a) => a.action === 'POSITION_STATED');
      expect(entry?.details).toMatchObject({ restedOn: 2, contradictedBy: 1 });
    });

    it('refuses an empty statement rather than recording a blank conclusion', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      expect(await caseManagerAdapter.statePosition('case-1', '   ')).toBe(false);
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('keeps both statements in the log when a case changes its mind', async () => {
      const first = makeCase({ id: 'case-1' });
      getCase.mockResolvedValue(first);
      saveCase.mockResolvedValue(undefined);
      await caseManagerAdapter.statePosition('case-1', 'First reading.');

      const afterFirst = saveCase.mock.calls[0][0] as IntelCaseUI;
      getCase.mockResolvedValue(afterFirst);
      await caseManagerAdapter.statePosition('case-1', 'Revised reading.');

      const afterSecond = saveCase.mock.calls[1][0] as IntelCaseUI;
      expect(afterSecond.position?.statement).toBe('Revised reading.');
      expect(afterSecond.activityLog.filter((a) => a.action === 'POSITION_STATED')).toHaveLength(2);
    });
  });

  describe('contradictions — what argues against a case', () => {
    it('records counter-evidence WITHOUT putting it in relatedEntities', async () => {
      // The separation is the point. Folding counter-evidence into the
      // supporting list makes "rests on five records" indistinguishable from
      // "rests on three records and two that dispute them".
      const current = makeCase({ id: 'case-1', relatedEntities: ['entity-a'] });
      getCase.mockResolvedValue(current);
      saveCase.mockResolvedValue(undefined);

      const ok = await caseManagerAdapter.linkContradictionsToCase('case-1', ['entity-x']);

      expect(ok).toBe(true);
      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.contradictedBy).toEqual(['entity-x']);
      expect(saved.relatedEntities).toEqual(['entity-a']);
    });

    it('logs the link, so a replay can account for it', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1' }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.linkContradictionsToCase('case-1', ['entity-x']);

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      const entry = saved.activityLog.find((a) => a.action === 'CONTRADICTION_LINKED');
      expect(entry).toBeDefined();
      expect(entry?.details).toMatchObject({ entityId: 'entity-x' });
    });

    it('dedupes rather than accumulating the same contradiction twice', async () => {
      getCase.mockResolvedValue(makeCase({ id: 'case-1', contradictedBy: ['entity-x'] }));
      saveCase.mockResolvedValue(undefined);

      const ok = await caseManagerAdapter.linkContradictionsToCase('case-1', ['entity-x']);

      expect(ok).toBe(true);
      expect(saveCase).not.toHaveBeenCalled();
    });

    it('removes a contradiction and logs THAT too', async () => {
      // Symmetric for the same reason unlinking evidence is logged: a record
      // showing a contradiction attached and never withdrawn is wrong in a
      // direction that matters.
      getCase.mockResolvedValue(makeCase({ id: 'case-1', contradictedBy: ['entity-x', 'entity-y'] }));
      saveCase.mockResolvedValue(undefined);

      await caseManagerAdapter.unlinkContradictionsFromCase('case-1', ['entity-x']);

      const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
      expect(saved.contradictedBy).toEqual(['entity-y']);
      expect(saved.activityLog.some((a) => a.action === 'CONTRADICTION_UNLINKED')).toBe(true);
    });

    it('returns false for a case that does not exist', async () => {
      getCase.mockResolvedValue(null);
      expect(await caseManagerAdapter.linkContradictionsToCase('nope', ['x'])).toBe(false);
    });
  });

  describe('linkEntitiesToCase / linkCases', () => {
    it('linkEntitiesToCase merges and dedupes relatedEntities, returns boolean', async () => {
      const current = makeCase({ id: 'case-1', relatedEntities: ['entity-a'] });
      getCase.mockResolvedValue(current);
      saveCase.mockResolvedValue(undefined);

      const result = await caseManagerAdapter.linkEntitiesToCase('case-1', ['entity-a', 'entity-b']);

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({ relatedEntities: ['entity-a', 'entity-b'] }));
    });

    it('linkCases merges and dedupes relatedCases, returns false when the source case is missing', async () => {
      getCase.mockResolvedValue(null);
      const result = await caseManagerAdapter.linkCases('missing', ['case-2']);
      expect(result).toBe(false);
      expect(saveCase).not.toHaveBeenCalled();
    });
  });
});

/*
 * Plan item 1.3: a record is evidence for a case or argues against it, never
 * both. Neither link checked the other list, so a record could sit in both and
 * a case's position would count it on each side.
 */
describe('CaseManagerAdapter — evidence and contradiction exclude each other', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCase.mockReset().mockResolvedValue(undefined);
  });

  it('refuses to link a contradiction as evidence, says why, and changes nothing', async () => {
    getCase.mockReset().mockResolvedValue(makeCase({ contradictedBy: ['report-9'] }));

    await expect(caseManagerAdapter.linkEntitiesToCase('case-1', ['report-9']))
      .rejects.toThrow(/already recorded as arguing against this case/);
    expect(saveCase).not.toHaveBeenCalled();
  });

  it('refuses to record evidence as a contradiction, says why, and changes nothing', async () => {
    getCase.mockReset().mockResolvedValue(makeCase({ relatedEntities: ['report-9'] }));

    await expect(caseManagerAdapter.linkContradictionsToCase('case-1', ['report-9']))
      .rejects.toThrow(/already evidence for this case/);
    expect(saveCase).not.toHaveBeenCalled();
  });

  it('still links a record that is on neither list', async () => {
    getCase.mockReset().mockResolvedValue(makeCase({ contradictedBy: ['report-9'] }));

    await expect(caseManagerAdapter.linkEntitiesToCase('case-1', ['report-10'])).resolves.toBe(true);
    expect(saveCase).toHaveBeenCalledWith(expect.objectContaining({ relatedEntities: ['report-10'] }));
  });
});

/*
 * A case's sources (decision D-DP, DP7): the articles it rests on, each its link, its outlet and when it
 * was reported. A case had related records and no place for the reports behind a GDELT event; "start a
 * case" from Diplomacy's drawer seeds one with its story's articles.
 */
describe('CaseManagerAdapter — a case\'s sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCase.mockReset().mockResolvedValue(makeCase());
    saveCase.mockReset().mockResolvedValue(undefined);
    createCase.mockReset();
  });

  it('adds an article: its link, outlet and when it was reported, and logs it', async () => {
    expect(await caseManagerAdapter.addSources('case-1', [{ url: '  https://www.reuters.com/world/x  ', reportedAt: '2026-10-13T09:00:00.000Z' }])).toBe(1);
    const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
    expect(saved.sources).toEqual([{ url: 'https://www.reuters.com/world/x', outlet: 'reuters.com', reportedAt: '2026-10-13T09:00:00.000Z', addedAt: expect.any(String) }]);
    expect(saved.activityLog.at(-1)).toMatchObject({ action: 'SOURCE_ADDED', details: { url: 'https://www.reuters.com/world/x' } });
  });

  it('refuses what is not a web link, and an article the case already holds', async () => {
    getCase.mockResolvedValue(makeCase({ sources: [{ url: 'https://tass.ru/1', outlet: 'tass.ru', addedAt: '2026-10-13T00:00:00.000Z' }] }));
    expect(await caseManagerAdapter.addSources('case-1', [{ url: 'javascript:alert(1)' }, { url: 'not a link' }, { url: 'https://tass.ru/1' }])).toBe(0);
    expect(saveCase).not.toHaveBeenCalled();
  });

  it('removes one, and logs it', async () => {
    getCase.mockResolvedValue(makeCase({ sources: [{ url: 'https://tass.ru/1', outlet: 'tass.ru', addedAt: '2026-10-13T00:00:00.000Z' }] }));
    expect(await caseManagerAdapter.removeSource('case-1', 'https://tass.ru/1')).toBe(true);
    const saved = saveCase.mock.calls[0][0] as IntelCaseUI;
    expect(saved.sources).toEqual([]);
    expect(saved.activityLog.at(-1)).toMatchObject({ action: 'SOURCE_REMOVED', details: { url: 'https://tass.ru/1' } });
  });

  it('starts a case with its sources, each logged after its creation', async () => {
    const created = makeCase({ id: 'case-new', activityLog: [{ id: 'a1', action: 'CREATED' as never, timestamp: '2026-10-13T00:00:00.000Z', userId: 'me', details: {} }] });
    createCase.mockResolvedValue(created);
    getCase.mockResolvedValue(created);
    const id = await caseManagerAdapter.addCase({
      title: 'Egypt and Saudi Arabia: Declare truce, ceasefire', description: 'Seeded from Diplomacy.',
      sources: [{ url: 'https://a.example/1', reportedAt: '2026-10-13T09:00:00.000Z' }, { url: 'https://b.example/2' }],
    });
    expect(id).toBe('case-new');
    const saved = saveCase.mock.calls.at(-1)![0] as IntelCaseUI;
    expect(saved.sources!.map((s) => s.url)).toEqual(['https://a.example/1', 'https://b.example/2']);
    expect(saved.activityLog.map((e) => e.action)).toEqual(['CREATED', 'SOURCE_ADDED', 'SOURCE_ADDED']);
  });

  it('carries the sources to the screens', async () => {
    listCases.mockResolvedValue([makeCase({ sources: [{ url: 'https://tass.ru/1', outlet: 'tass.ru', addedAt: '2026-10-13T00:00:00.000Z' }] })]);
    const [item] = await caseManagerAdapter.getCases();
    expect(item.sources).toEqual([{ url: 'https://tass.ru/1', outlet: 'tass.ru', addedAt: '2026-10-13T00:00:00.000Z' }]);
  });
});
