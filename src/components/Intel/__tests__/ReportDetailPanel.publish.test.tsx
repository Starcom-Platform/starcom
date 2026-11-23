/**
 * Publishing a report from its panel (decision D-RP): offered on the person's own reports only, asking who may
 * receive it when nobody has decided, and saying afterwards when it went, and whether it changed since.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { recordReportPublished } from '../../../services/intel/publishedReports';
import { eventOutbox } from '../../../services/intel/outbox/EventOutbox';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

const setRecordDistribution = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../../services/intel/attention/setRecordDistribution', () => ({ setRecordDistribution }));
const reviewReportPublish = vi.hoisted(() => vi.fn());
const reviewReportWithdrawal = vi.hoisted(() => vi.fn());
vi.mock('../../../services/publishing/reports', () => ({ reviewReportPublish, reviewReportWithdrawal }));

const report = (overrides: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Berth 4 cranes at night', content: 'Three cranes.', author: 'a', category: 'GENERAL', tags: [],
  visibility: 'public', createdAt: new Date(Date.UTC(2026, 10, 19, 9)), updatedAt: new Date(Date.UTC(2026, 10, 19, 9)),
  status: 'DRAFT', collaborators: [], history: [], ...overrides,
});
const panel = (r: IntelReportUI) => render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

beforeEach(() => {
  localStorage.clear();
  setRecordDistribution.mockClear();
  reviewReportPublish.mockReset();
  reviewReportPublish.mockResolvedValue({ status: 'cancelled' });
  reviewReportWithdrawal.mockReset();
  reviewReportWithdrawal.mockResolvedValue({ status: 'cancelled' });
});

describe("a report's Publish", () => {
  it('opens the review for your own report, and says why when it is refused', async () => {
    reviewReportPublish.mockResolvedValue({ status: 'refused', reason: 'This report is marked as holding source or method detail.' });
    panel(report());
    fireEvent.click(screen.getByTestId('report-publish'));
    expect(reviewReportPublish).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    expect((await screen.findByTestId('report-publish-note')).textContent).toBe('This report is marked as holding source or method detail.');
  });

  it('is not offered on a report read from the relays, or one sent to you', () => {
    panel(report({ history: [{ action: 'IMPORTED', user: 'nostr', timestamp: '' }] }));
    expect(screen.queryByTestId('report-publish')).toBeNull();
  });

  it('asks who may receive an undecided report, keeps the choice, then opens the review', async () => {
    panel(report({ visibility: undefined }));
    fireEvent.click(screen.getByTestId('report-publish'));
    const asking = await screen.findByTestId('report-publish-ask');
    expect(reviewReportPublish).not.toHaveBeenCalled();
    fireEvent.click(within(asking).getByLabelText(/^Public/));
    await waitFor(() => expect(reviewReportPublish).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' })));
    expect(setRecordDistribution).toHaveBeenCalledWith({ kind: 'report', id: 'r1' }, 'public');
  });

  it('says nothing was published when no relay took it', async () => {
    reviewReportPublish.mockRejectedValue(new Error('No relay took it: blocked'));
    panel(report());
    fireEvent.click(screen.getByTestId('report-publish'));
    expect((await screen.findByTestId('report-publish-note')).textContent).toBe('Nothing was published: No relay took it: blocked');
  });

  it('says when it was published, offers to publish again, and says when it changed since', () => {
    const at = Date.UTC(2026, 10, 20, 12);
    act(() => recordReportPublished('r1', { address: 'a', eventId: 'e', firstAt: at, at, relays: 4, reportUpdatedAt: Date.UTC(2026, 10, 19, 9) }));
    const { unmount } = panel(report());
    expect(screen.getByTestId('report-published').textContent).toMatch(/^Published .*2026.* to the public relays: 4 took it\. Anyone can read it\.$/);
    expect(screen.getByTestId('report-publish').textContent).toBe('Publish again');
    unmount();
    panel(report({ updatedAt: new Date(Date.UTC(2026, 10, 21)) }));
    expect(screen.getByTestId('report-published').textContent).toMatch(/Changed since: publish again to replace the published version\.$/);
  });

  it('offers Withdraw once it is published, and says when it was withdrawn', async () => {
    panel(report());
    expect(screen.queryByTestId('report-withdraw')).toBeNull();
    const at = Date.UTC(2026, 10, 20, 12);
    act(() => recordReportPublished('r1', { address: 'a', eventId: 'e', firstAt: at, at, relays: 4, reportUpdatedAt: at }));
    fireEvent.click(await screen.findByTestId('report-withdraw'));
    expect(reviewReportWithdrawal).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    act(() => recordReportPublished('r1', { address: 'a', eventId: 'e2', firstAt: at, at, relays: 4, reportUpdatedAt: at, withdrawnAt: at + 60_000 }));
    expect(screen.getByTestId('report-withdrawn').textContent).toMatch(/^Withdrawn .*2026.*: relays that keep the newest version show that it was withdrawn/);
    expect(screen.queryByTestId('report-withdraw')).toBeNull();
    expect(screen.queryByTestId('report-published')).toBeNull();
    expect(screen.getByTestId('report-publish').textContent).toBe('Publish again');
  });

  it('says nothing was withdrawn when no relay took the notice', async () => {
    const at = Date.UTC(2026, 10, 20, 12);
    act(() => recordReportPublished('r1', { address: 'a', eventId: 'e', firstAt: at, at, relays: 4, reportUpdatedAt: at }));
    reviewReportWithdrawal.mockRejectedValue(new Error('No relay took it: blocked'));
    panel(report());
    fireEvent.click(screen.getByTestId('report-withdraw'));
    expect((await screen.findByTestId('report-publish-note')).textContent).toBe('Nothing was withdrawn: No relay took it: blocked');
  });
});

describe('a report kept because no relay answered (W1)', () => {
  const secret = generateSecretKey();
  const address = `30023:${getPublicKey(secret)}:r1`;
  const sign = (kind: number, tags: string[][], at: number) => finalizeEvent({ kind, tags, content: '', created_at: at }, secret);

  it('says its note waits on this device, and cancelling lets it go', async () => {
    await eventOutbox.keep(sign(30023, [['d', 'r1']], 100), ['wss://one.example'], {
      after: { published: { report: 'r1', address, firstAt: 100_000, reportUpdatedAt: 100_000 } },
    });
    panel(report());
    const line = await screen.findByTestId('report-kept');
    expect(line.textContent).toMatch(/^Waiting to send: no relay answered\. It is kept on this device and goes when one does\./);
    expect(screen.queryByTestId('report-published')).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: 'Cancel sending' }));
    await waitFor(() => expect(screen.queryByTestId('report-kept')).toBeNull());
    expect(await eventOutbox.waiting()).toEqual([]);
  });

  it('says when it was given up on, and offers to try again', async () => {
    const kept = sign(30023, [['d', 'r1']], 100);
    await eventOutbox.keep(kept, ['wss://one.example'], { after: { published: { report: 'r1', address, firstAt: 100_000, reportUpdatedAt: 100_000 } } });
    for (let i = 0; i < 10; i += 1) await eventOutbox.drain(async () => { throw new Error('No relay took it: offline'); });
    panel(report());
    const line = await screen.findByTestId('report-kept');
    expect(line.textContent).toMatch(/^Not sent: no relay took it in 10 tries\. Last answer: No relay took it: offline/);
    fireEvent.click(within(line).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('report-kept').textContent).toMatch(/^Waiting to send/));
    await eventOutbox.cancel(kept.id);
  });

  it('offers no second withdrawal while one waits, and cancelling it takes its deletion request too', async () => {
    act(() => recordReportPublished('r1', { address, eventId: 'e', firstAt: 1000, at: 1000, relays: 4, reportUpdatedAt: 1000 }));
    await eventOutbox.keep(sign(5, [['a', address], ['k', '30023']], 300), ['wss://one.example']);
    await eventOutbox.keep(sign(30023, [['d', 'r1'], ['t', 'retracted']], 301), ['wss://one.example'], { after: { withdrawn: { report: 'r1', at: 300_000 } } });
    panel(report());
    const line = await screen.findByTestId('report-withdrawal-kept');
    expect(line.textContent).toMatch(/^The withdrawal waits to send/);
    expect(screen.queryByTestId('report-withdraw')).toBeNull();
    expect(screen.getByTestId('report-published')).toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: 'Cancel sending' }));
    await waitFor(() => expect(screen.queryByTestId('report-withdrawal-kept')).toBeNull());
    expect(await eventOutbox.waiting()).toEqual([]);
    expect(screen.getByTestId('report-withdraw')).toBeTruthy();
  });
});
