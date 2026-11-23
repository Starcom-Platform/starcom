import { describe, it, expect } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { CreateIntelReportInput, IntelReportStatus } from '../../../types/intel/IntelReportUI';

// Simple helper to run sequential status transitions and assert history + versioning behavior.
async function createBaseReport() {
  const input: CreateIntelReportInput = {
    title: 'Lifecycle Test',
    content: 'Initial content',
    category: 'TEST',
    tags: ['lifecycle'],
    latitude: 10,
    longitude: 20,
  } as any; // classification union simplified for test context
  return intelReportService.createReport(input, 'tester');
}

describe('IntelReportService status transitions', () => {
  it('follows valid forward path DRAFT -> SUBMITTED -> REVIEWED -> APPROVED -> ARCHIVED', async () => {
    const rpt = await createBaseReport();
    const ordered: IntelReportStatus[] = ['SUBMITTED','REVIEWED','APPROVED','ARCHIVED'];
    let current = rpt;
    for (const next of ordered) {
      const updated = await intelReportService.updateStatus(current.id, next);
      expect(updated?.status).toBe(next);
      // history should contain a STATUS_CHANGED entry for each transition
      const statusEvents = updated?.history?.filter(h => h.action === 'STATUS_CHANGED');
      expect(statusEvents?.length).toBe(ordered.indexOf(next) + 1);
      current = updated!;
    }
  });

  it('rejects invalid backward transition APPROVED -> REVIEWED', async () => {
    const rpt = await createBaseReport();
    await intelReportService.updateStatus(rpt.id, 'SUBMITTED');
    await intelReportService.updateStatus(rpt.id, 'REVIEWED');
    await intelReportService.updateStatus(rpt.id, 'APPROVED');
    await expect(intelReportService.updateStatus(rpt.id, 'REVIEWED')).rejects.toThrow(/Invalid status transition/);
  });

  // Attribution/contribution surfacing needs "who approved this" to be
  // recoverable from history — previously STATUS_CHANGED entries never
  // set `user` at all, so an APPROVED report's approver was unrecoverable.
  it('records who performed a status transition when the caller provides an identity', async () => {
    const rpt = await createBaseReport();
    const updated = await intelReportService.updateStatus(rpt.id, 'SUBMITTED', 'analyst-pubkey-abc');
    const statusEvent = updated?.history?.find(h => h.action === 'STATUS_CHANGED');
    expect(statusEvent?.user).toBe('analyst-pubkey-abc');
  });

  it('leaves user unattributed (not a fabricated placeholder) when the caller has no identity to provide', async () => {
    const rpt = await createBaseReport();
    const updated = await intelReportService.updateStatus(rpt.id, 'SUBMITTED');
    const statusEvent = updated?.history?.find(h => h.action === 'STATUS_CHANGED');
    expect(statusEvent?.user).toBeUndefined();
  });
});
