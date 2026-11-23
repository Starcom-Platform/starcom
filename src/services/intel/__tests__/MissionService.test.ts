import { describe, it, expect } from 'vitest';
import { missionService, absentLink } from '../MissionService';
import { intelReportService } from '../IntelReportService';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { heldDeletions, undoDeletion } from '../deletionHolding';
import { isEncryptedAtRest } from '../IntelWorkspaceManager';
import { MissionStatus } from '../../../types/intel/MissionUI';

describe('MissionService', () => {
  it('createMission persists and is retrievable by id and in the list', async () => {
    const created = await missionService.createMission({
      title: 'Service-Level Mission',
      briefing: 'Testing the mission service layer'
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe(MissionStatus.DRAFT);

    const fetched = await missionService.getMission(created.id);
    expect(fetched?.title).toBe('Service-Level Mission');

    const list = await missionService.listMissions();
    expect(list.some(m => m.id === created.id)).toBe(true);
  });

  it('objectives passed as plain descriptions are assigned ids and start incomplete', async () => {
    const created = await missionService.createMission({
      title: 'Objectives Mission',
      briefing: '...',
      objectives: ['Recon target', 'Extract asset']
    });
    expect(created.objectives).toHaveLength(2);
    expect(created.objectives.every(o => o.id && o.completed === false)).toBe(true);
    expect(created.objectives.map(o => o.description)).toEqual(['Recon target', 'Extract asset']);
  });

  it('links to Reports and Cases at creation', async () => {
    const created = await missionService.createMission({
      title: 'Linked Mission',
      briefing: '...',
      relatedReports: ['intel-report-1'],
      relatedCases: ['intelcase-1']
    });
    expect(created.relatedReports).toEqual(['intel-report-1']);
    expect(created.relatedCases).toEqual(['intelcase-1']);
  });

  it('accepts human and AI collaborators via saveMission, same full-replace pattern as IntelCaseService', async () => {
    const created = await missionService.createMission({ title: 'Crewed Mission', briefing: '...' });
    await missionService.saveMission({
      ...created,
      collaborators: [
        { userId: 'pk-human-1', name: 'Analyst One', addedAt: new Date().toISOString(), addedBy: 'operative' },
        { userId: 'pk-mecha-jono', name: 'Mecha Jono', addedAt: new Date().toISOString(), addedBy: 'operative' }
      ]
    });

    const reloaded = await missionService.getMission(created.id);
    expect(reloaded?.collaborators).toHaveLength(2);
    expect(reloaded?.collaborators.map(c => c.userId)).toEqual(['pk-human-1', 'pk-mecha-jono']);
  });

  it('reaches READY_FOR_PACKAGE through the valid DRAFT -> PLANNING -> READY_FOR_PACKAGE transition path', async () => {
    // A report held here: a link to one that is not here rests on nothing (plan item 0.6).
    const report = await intelReportService.createReport(
      { title: 'Progress basis', content: 'Observed.', category: 'general', tags: [] }, 'analyst-1',
    );
    const created = await missionService.createMission({ title: 'Progressing Mission', briefing: '...', relatedReports: [report.id] });
    expect(created.status).toBe(MissionStatus.DRAFT);

    const planning = await missionService.updateStatus(created.id, MissionStatus.PLANNING);
    expect(planning?.status).toBe(MissionStatus.PLANNING);

    const ready = await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
    expect(ready?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
  });

  it('updateStatus enforces the valid-transition state machine, same shape as IntelCaseService/IntelReportService', async () => {
    const created = await missionService.createMission({ title: 'Transition Mission', briefing: '...' });

    // DRAFT -> READY_FOR_PACKAGE is not a direct valid transition (must go through PLANNING)
    await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE)).rejects.toThrow(/invalid mission status transition/i);
  });

  // 'dispatching stamps dispatchedDate' lived here, and reached DISPATCHED by
  // calling updateStatus. Only publishing can dispatch now (plan item 0.7), so
  // the stamp is asserted where dispatch happens: MissionService.publishToNavcom
  // .test.ts, and the refusal to dispatch by hand in MissionService.record.test.ts.

  it('records who performed a status transition when the caller provides an identity', async () => {
    const created = await missionService.createMission({ title: 'Attributed Mission', briefing: '...' });
    const updated = await missionService.updateStatus(created.id, MissionStatus.PLANNING, 'analyst-pubkey-abc');
    const statusEvent = updated?.activityLog.find(a => a.action === 'STATUS_CHANGED');
    expect(statusEvent?.userId).toBe('analyst-pubkey-abc');
    expect(statusEvent?.details).toMatchObject({ fromStatus: MissionStatus.DRAFT, toStatus: MissionStatus.PLANNING });
  });

  /**
   * This used to assert the opposite — that an unattributed transition logged
   * NOTHING — on the reasoning that a fabricated entry is worse than none.
   * The anti-fabrication half of that is right and is still asserted below.
   * Dropping the entry was the wrong way to get it: it discarded a fact that
   * definitely happened (the mission moved) in order to avoid asserting one
   * that hadn't (who moved it), so a mission could travel DRAFT ->
   * DISPATCHED leaving no evidence it had ever moved.
   *
   * The Case side already settled this the other way (see currentAttribution
   * in caseManagerAdapter): record the event, leave the actor empty. An empty
   * userId reads as "we do not know who"; a placeholder like 'unknown' or
   * 'system' would launder that into a named actor, which is the thing an
   * audit trail built for court and journalistic use must never do.
   */
  it('records an unattributed status change with an empty actor, never a fabricated one', async () => {
    const created = await missionService.createMission({ title: 'Unattributed Mission', briefing: '...' });
    const updated = await missionService.updateStatus(created.id, MissionStatus.PLANNING);

    const statusEvent = updated?.activityLog.find(a => a.action === 'STATUS_CHANGED');
    expect(statusEvent).toBeDefined();
    expect(statusEvent?.details).toMatchObject({ fromStatus: MissionStatus.DRAFT, toStatus: MissionStatus.PLANNING });
    // Empty, not a stand-in name.
    expect(statusEvent?.userId).toBe('');
  });

  describe('a mission must rest on something before it can be packaged', () => {
    // relatedReports/relatedCases were optional and read by nothing but a
    // counter, so a package could be built, signed and dispatched from a title
    // and a briefing alone — and its relatedReportCount: 0 was a decoration
    // rather than a claim.
    it('refuses READY_FOR_PACKAGE when nothing is linked and nothing is claimed', async () => {
      const created = await missionService.createMission({ title: 'Groundless', briefing: 'Act now.' });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);

      await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))
        .rejects.toThrow(/rests on no evidence/i);
      expect((await missionService.getMission(created.id))?.status).toBe(MissionStatus.PLANNING);
    });

    it('accepts a linked case as evidence, not only reports', async () => {
      const caseId = await caseManagerAdapter.addCase({ title: 'Evidence case', description: 'Held here.' });
      const created = await missionService.createMission({
        title: 'From a case', briefing: '...', relatedCases: [caseId!],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      const ready = await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
      expect(ready?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it('accepts direct observation when the briefing SAYS so', async () => {
      // The basis becomes a recorded claim instead of an unnoticed absence.
      // Silently exempting unlinked missions would have reproduced the gap.
      const created = await missionService.createMission({
        title: 'Witnessed', briefing: 'Rests on direct observation by the operator at the site.',
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      const ready = await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
      expect(ready?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it('reads a direct-observation declaration in a briefing encrypted at rest', async () => {
      // A protected mission stores its briefing as ciphertext. The gate read the stored
      // field, found no declaration in the ciphertext, and refused a mission whose operator
      // had written exactly what the refusal told them to write.
      const created = await missionService.createMission({
        title: 'Witnessed, protected', sensitivity: 'protected',
        briefing: 'Rests on direct observation by the operator at the site.',
      });
      // Otherwise this would pass for the wrong reason.
      expect(isEncryptedAtRest((await missionService.getMission(created.id))?.briefing)).toBe(true);

      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      const ready = await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
      expect(ready?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it('still refuses a protected mission whose encrypted briefing declares nothing', async () => {
      const created = await missionService.createMission({
        title: 'Groundless, protected', sensitivity: 'protected', briefing: 'Act now.',
      });
      expect(isEncryptedAtRest((await missionService.getMission(created.id))?.briefing)).toBe(true);
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);

      await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))
        .rejects.toThrow(/rests on no evidence/i);
    });

    // Plan item 0.6: a link counted whether or not its record still existed, so
    // a mission whose only report had been deleted still read as resting on it.
    it('does not count a link to a record that is not here', async () => {
      const created = await missionService.createMission({
        title: 'Linked to nothing held', briefing: '...', relatedReports: ['intel-report-never-held'], relatedCases: ['case-never-held'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))
        .rejects.toThrow(/rests on no evidence/i);
    });

    it('stops counting a report once it is deleted, and counts it again after Undo', async () => {
      const report = await intelReportService.createReport(
        { title: 'The only basis', content: 'Seen at the site.', category: 'general', tags: [] }, 'analyst-1',
      );
      const created = await missionService.createMission({ title: 'Rests on one report', briefing: '...', relatedReports: [report.id] });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await intelReportService.deleteReport(report.id);

      await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))
        .rejects.toThrow(/rests on no evidence/i);

      await undoDeletion(heldDeletions().find((h) => h.label === 'Report "The only basis"')!.id);
      const ready = await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
      expect(ready?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it('names a link to a deleted record as deleted, and one never held here as not here', async () => {
      const report = await intelReportService.createReport(
        { title: 'Bridge closure', content: 'Closed at noon.', category: 'general', tags: [] }, 'analyst-1',
      );
      await intelReportService.deleteReport(report.id);

      expect(absentLink('report', report.id)).toEqual({ label: 'Bridge closure (deleted)', deleted: true });
      expect(absentLink('case', 'case-never-held')).toEqual({ label: 'case-never-held (not in this workspace)', deleted: false });
    });

    it('does not gate the earlier transitions — drafting stays free', async () => {
      // The gate belongs where a mission stops being drafted and becomes a
      // thing intended to leave, not at the first keystroke.
      const created = await missionService.createMission({ title: 'Draft', briefing: 'thinking' });
      const planning = await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      expect(planning?.status).toBe(MissionStatus.PLANNING);
    });
  });

  it('deleteMission removes it', async () => {
    const created = await missionService.createMission({ title: 'Deletable Mission', briefing: '...' });
    await missionService.deleteMission(created.id);
    expect(await missionService.getMission(created.id)).toBeNull();
  });
});
