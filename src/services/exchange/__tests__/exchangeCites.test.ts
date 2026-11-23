/**
 * An Exchange package of a report that rests on observations (decision D-MX:
 * MX3, MX22, MX24). The draft's citations travel beside the package, never in
 * its manifest; the review shows them; the announcement cites them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const uploadIntelPackage = vi.fn();
const publishIntelReport = vi.fn();
vi.mock('../../IPFSService', () => ({
  default: { uploadIntelPackage: (...args: unknown[]) => uploadIntelPackage(...args) },
}));
vi.mock('../../intel/NostrIntelBroadcastService', () => ({
  NostrIntelBroadcastService: vi.fn().mockImplementation(function () { return ({
    publishIntelReport: (...args: unknown[]) => publishIntelReport(...args),
  }); }),
}));
vi.mock('../../BlockchainAnchorService', () => ({ BlockchainAnchorService: vi.fn().mockImplementation(function () { return ({}); }) }));

import { composeInputFromDraft } from '../adapters/reportToCompose';
import { PackageComposer } from '../PackageComposer';

const A = 'a'.repeat(64);
const RELAY = 'wss://relay.example';
const draft = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Seen at the anchor', content: 'What was there', author: 'Kestrel', category: 'GENERAL', tags: [],
  createdAt: new Date('2026-10-06T00:00:00Z'), updatedAt: new Date('2026-10-06T00:00:00Z'), status: 'DRAFT',
  visibility: 'public', cites: [{ eventId: A, relay: RELAY }], ...over,
});

beforeEach(() => { uploadIntelPackage.mockReset(); publishIntelReport.mockReset(); });

describe('an Exchange package of a report resting on an observation', () => {
  it('carries the citations beside its manifest, never in it (MX22)', () => {
    const composed = PackageComposer.compose(composeInputFromDraft(draft()));
    expect(composed.cites).toEqual([{ eventId: A, relay: RELAY }]);
    expect(JSON.stringify(composed.manifest)).not.toContain(A);
  });

  it('carries them through to the zipped package too', async () => {
    const composed = await PackageComposer.composeZip(composeInputFromDraft(draft()));
    expect(composed.cites).toEqual([{ eventId: A, relay: RELAY }]);
  });

  it('cites nothing of a report that is not Public: the Exchange goes only to public relays (MX24)', () => {
    expect(composeInputFromDraft(draft({ visibility: 'limited' })).cites).toBeUndefined();
    expect(composeInputFromDraft(draft({ visibility: undefined })).cites).toBeUndefined();
    expect(PackageComposer.compose(composeInputFromDraft(draft({ cites: undefined }))).cites).toBeUndefined();
  });

  it('cites them on the event that announces it', async () => {
    uploadIntelPackage.mockResolvedValue({ success: true, hash: 'QmCited', url: 'https://ipfs.io/ipfs/QmCited' });
    publishIntelReport.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });
    const { publishAdapter } = await import('../PublishAdapter');
    await publishAdapter.publish(PackageComposer.compose(composeInputFromDraft(draft())));
    expect(publishIntelReport.mock.calls[0][0]).toMatchObject({ ipfsCid: 'QmCited', cites: [{ eventId: A, relay: RELAY }] });
  });
});
