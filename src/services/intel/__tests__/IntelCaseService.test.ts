import { describe, it, expect } from 'vitest';
import { intelCaseService } from '../IntelCaseService';
import { CaseStatus } from '../../../types/intel/IntelCaseUI';

describe('IntelCaseService', () => {
  it('createCase persists and is retrievable by id and in the list', async () => {
    const created = await intelCaseService.createCase({
      title: 'Service-Level Case',
      description: 'Testing the case service layer'
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe(CaseStatus.NEW);

    const fetched = await intelCaseService.getCase(created.id);
    expect(fetched?.title).toBe('Service-Level Case');

    const list = await intelCaseService.listCases();
    expect(list.some(c => c.id === created.id)).toBe(true);
  });

  it('updateStatus enforces the valid-transition state machine, same shape as IntelReportService', async () => {
    const created = await intelCaseService.createCase({ title: 'Transition Case', description: '...' });

    // NEW -> OPEN is valid
    const opened = await intelCaseService.updateStatus(created.id, CaseStatus.OPEN);
    expect(opened?.status).toBe(CaseStatus.OPEN);

    // OPEN -> RESOLVED is not a direct valid transition (must go through IN_PROGRESS)
    await expect(intelCaseService.updateStatus(created.id, CaseStatus.RESOLVED)).rejects.toThrow(/invalid case status transition/i);
  });

  it('closing a case stamps closedDate', async () => {
    const created = await intelCaseService.createCase({ title: 'Closeable Case', description: '...' });
    const closed = await intelCaseService.updateStatus(created.id, CaseStatus.CLOSED);
    expect(closed?.closedDate).toBeTruthy();
  });

  it('reopening a closed case takes its closing date away (plan item 1.8)', async () => {
    // It kept it, and counted as closed while open.
    const created = await intelCaseService.createCase({ title: 'Reopened Case', description: '...' });
    await intelCaseService.updateStatus(created.id, CaseStatus.CLOSED);
    expect((await intelCaseService.getCase(created.id))?.closedDate).toBeTruthy();
    const reopened = await intelCaseService.updateStatus(created.id, CaseStatus.OPEN);
    expect(reopened?.closedDate).toBeUndefined();
  });

  it('saveCase full-replaces the record — the shape the case adapter will use for comment/collaborator mutations', async () => {
    const created = await intelCaseService.createCase({ title: 'Mutable Case', description: '...' });
    await intelCaseService.saveCase({ ...created, tags: ['re-tagged'] });

    const reloaded = await intelCaseService.getCase(created.id);
    expect(reloaded?.tags).toEqual(['re-tagged']);
  });

  it('deleteCase removes it', async () => {
    const created = await intelCaseService.createCase({ title: 'Deletable Case', description: '...' });
    await intelCaseService.deleteCase(created.id);
    expect(await intelCaseService.getCase(created.id)).toBeNull();
  });

  describe('resolving asserts a conclusion, so there must be one', () => {
    const toInProgress = async (title: string) => {
      const created = await intelCaseService.createCase({ title, description: '...' });
      await intelCaseService.updateStatus(created.id, CaseStatus.OPEN);
      await intelCaseService.updateStatus(created.id, CaseStatus.IN_PROGRESS);
      return created;
    };

    it('refuses RESOLVED while the case states nothing', async () => {
      // An aggregation with no aggregate — worse at RESOLVED than anywhere
      // else, because the status itself asserts a conclusion the record does
      // not contain.
      const created = await toInProgress('Unconcluded');
      await expect(intelCaseService.updateStatus(created.id, CaseStatus.RESOLVED))
        .rejects.toThrow(/without a position/i);
      expect((await intelCaseService.getCase(created.id))?.status).toBe(CaseStatus.IN_PROGRESS);
    });

    it('allows RESOLVED once a position is stated', async () => {
      const created = await toInProgress('Concluded');
      const record = (await intelCaseService.getCase(created.id))!;
      await intelCaseService.saveCase({
        ...record,
        position: { statement: 'The registry changed twice.', adjudicatedBy: 'pk', adjudicatedAt: new Date().toISOString() },
      });

      const resolved = await intelCaseService.updateStatus(created.id, CaseStatus.RESOLVED);
      expect(resolved?.status).toBe(CaseStatus.RESOLVED);
    });

    it('does NOT gate CLOSED — ending without a conclusion is legitimate', async () => {
      // Investigations get abandoned, superseded, or turn out to be nothing.
      // Forcing a position here would manufacture conclusions to satisfy a check.
      const created = await toInProgress('Abandoned');
      const closed = await intelCaseService.updateStatus(created.id, CaseStatus.CLOSED);
      expect(closed?.status).toBe(CaseStatus.CLOSED);
    });

    it('treats a whitespace-only position as no position', async () => {
      const created = await toInProgress('Blank');
      const record = (await intelCaseService.getCase(created.id))!;
      await intelCaseService.saveCase({
        ...record,
        position: { statement: '   ', adjudicatedBy: '', adjudicatedAt: new Date().toISOString() },
      });
      await expect(intelCaseService.updateStatus(created.id, CaseStatus.RESOLVED))
        .rejects.toThrow(/without a position/i);
    });
  });
});
