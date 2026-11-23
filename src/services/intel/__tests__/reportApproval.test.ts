/**
 * A report cannot be approved by the key that wrote it (plan item 1.7).
 * Approval is a second look; the author's own is not one. The approver is the
 * key that signs in this browser, whatever a caller names, and the report's
 * history records it.
 */
import { describe, it, expect } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';

const reviewed = async (author?: string) => {
  const r = await intelReportService.createReport({ title: 'Berth 4 cranes at night', content: 'Three cranes working after 02:00.', category: 'GENERAL', tags: [] } as never, author);
  await intelReportService.updateStatus(r.id, 'SUBMITTED');
  await intelReportService.updateStatus(r.id, 'REVIEWED');
  return r;
};

describe('approving a report', () => {
  it('is refused to the key that wrote it', async () => {
    const r = await reviewed();
    expect(r.author).toBe(nostrIdentityService.signerPubkey());
    await expect(intelReportService.updateStatus(r.id, 'APPROVED')).rejects.toThrow(/someone other than its author/i);
    expect((await intelReportService.getReport(r.id))?.status).toBe('REVIEWED');
  });

  it('is refused to the key that wrote it, whoever the caller names', async () => {
    const r = await reviewed();
    await expect(intelReportService.updateStatus(r.id, 'APPROVED', 'someone-else')).rejects.toThrow(/someone other than its author/i);
  });

  it('is open to any other key, and the history says whose it was', async () => {
    const r = await reviewed('npub-of-the-author');
    const approved = await intelReportService.updateStatus(r.id, 'APPROVED');
    expect(approved?.status).toBe('APPROVED');
    const entry = approved?.history?.filter((h) => h.action === 'STATUS_CHANGED').at(-1);
    expect(entry).toMatchObject({ toStatus: 'APPROVED', user: nostrIdentityService.signerPubkey() });
  });
});
