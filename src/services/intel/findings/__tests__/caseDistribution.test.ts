/**
 * A case's position goes where the case's distribution says (plan item 0.4).
 *
 * "Publish position" sent the case's verdict to the findings relays whatever
 * the case said, so a Limited or Private case published its conclusion to
 * relays anyone can read and nobody can recall. It now goes where the case
 * may go, or nowhere with the words that say why; and everything that follows
 * it (a queued retry, a withdrawal) goes to the same place.
 *
 * The network is a stand-in; signing, the outbox and the ledger are real.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** The relays each broadcast was sent to: what the broadcaster was built with. */
const sentTo: Array<string[] | undefined> = [];
const publishFindingMock = vi.fn();
vi.mock('../FindingsBroadcastService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../FindingsBroadcastService')>()),
  FindingsBroadcastService: class {
    constructor(relays?: string[]) { sentTo.push(relays); }
    publishFinding(...args: unknown[]) { return publishFindingMock(...args); }
    dispose() {}
  },
}));
vi.mock('../../../identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => 'a'.repeat(64),
    signerPubkey: () => 'a'.repeat(64),
    refreshSigner: async () => 'a'.repeat(64),
    hasExtension: () => false,
    isLocked: () => false,
    asSigner: () => ({ getPublicKey: async () => 'a'.repeat(64), signEvent: async (e: unknown) => e }),
  },
}));

import {
  prepareCaseAdjudication, prepareAttestation, publishPreparedAttestation, prepareRetraction, drainFindingsOutbox,
} from '../FindingsPublisherService';
import { findingRelays } from '../FindingsBroadcastService';
import { attestationForCasePosition } from '../caseAdjudication';
import { publishedFindingsLedger } from '../PublishedFindingsLedger';
import { identifierFor } from '../FindingContent';
import { publishOutbox } from '../../outbox/PublishOutbox';
import { reviewCaseAdjudication } from '../../../publishing/findings';
import { currentReview, decideReview } from '../../../publishing/publishReview';
import { CaseStatus, CasePriority, type IntelCaseUI } from '../../../../types/intel/IntelCaseUI';
import type { InformationVisibility } from '../../../../types/intel/IntelItemUI';

const TEAM_RELAY = 'wss://team.relay.example';
const OPTS = { subjectRef: 'Newark food bank network', subjectKind: 'organization' as const, evidenceIsSynthetic: false };

function makeCase(visibility?: InformationVisibility): IntelCaseUI {
  return {
    id: 'case-1', caseNumber: 'C-042', title: 'Newark food banks', description: '',
    status: CaseStatus.OPEN, priority: CasePriority.MEDIUM,
    assignedTo: [], startDate: '2026-08-01T00:00:00.000Z',
    relatedEntities: ['r1', 'r2'],
    relatedCases: [], tags: [], metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'analyst', collaborators: [], comments: [], activityLog: [],
    position: {
      statement: 'Two of the five sites are closed.',
      verdict: 'substantiated',
      adjudicatedBy: 'analyst',
      adjudicatedAt: '2026-09-01T00:00:00.000Z',
    },
    ...(visibility ? { visibility } : {}),
  } as IntelCaseUI;
}

const refusalOf = (ready: ReturnType<typeof prepareCaseAdjudication>) =>
  ('refused' in ready ? ready.refused.refused?.reason : null) ?? null;

beforeEach(async () => {
  sentTo.length = 0;
  publishFindingMock.mockReset();
  for (const record of await publishOutbox.pending()) await publishOutbox.cancel(record.id);
});
afterEach(async () => {
  delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe("a case position goes where the case's distribution says", () => {
  it('goes nowhere for a case nobody has decided on, and says so', () => {
    expect(refusalOf(prepareCaseAdjudication(makeCase(), OPTS))).toMatch(/Nobody has decided who may receive this case/);
  });

  it('goes nowhere for a Private case', () => {
    expect(refusalOf(prepareCaseAdjudication(makeCase('private'), OPTS))).toMatch(/stays in this workspace and is never published/);
  });

  it('goes nowhere for a Limited case when this build has no internal relay', () => {
    expect(refusalOf(prepareCaseAdjudication(makeCase('limited'), OPTS))).toMatch(/no internal relay/);
  });

  it('goes only to the internal relay for a Limited case, and to the findings relays for a Public one', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    const limited = prepareCaseAdjudication(makeCase('limited'), OPTS);
    const open = prepareCaseAdjudication(makeCase('public'), OPTS);
    expect('prepared' in limited && limited.prepared.relays).toEqual([TEAM_RELAY]);
    expect('prepared' in open && open.prepared.relays).toEqual(findingRelays());
  });

  it('leaves findings that belong to no case on the findings relays', () => {
    const content = attestationForCasePosition(makeCase('public'), OPTS)!;
    const ready = prepareAttestation(content, { isMock: false });
    expect('prepared' in ready && ready.prepared.relays).toEqual(findingRelays());
  });

  it('shows exactly those relays in the review', async () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    const outcome = reviewCaseAdjudication(makeCase('limited'), OPTS);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));

    expect(currentReview()!.destinations).toEqual([{ address: TEAM_RELAY, kind: 'internal' }]);
    decideReview(currentReview()!.id, false);
    expect(await outcome).toBeNull();
  });
});

describe('what follows a position goes to the same place', () => {
  it('sends it there, and remembers where, so a withdrawal goes there too', async () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });
    const ready = prepareCaseAdjudication(makeCase('limited'), OPTS);
    if (!('prepared' in ready)) throw new Error('expected a prepared position');

    await publishPreparedAttestation(ready.prepared);
    expect(sentTo).toEqual([[TEAM_RELAY]]);
    const { claim } = ready.prepared.content;
    const slot = identifierFor(claim.subjectRef, claim.attribute);
    expect(publishedFindingsLedger.get(slot)?.relays).toEqual([TEAM_RELAY]);

    delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    const withdrawal = prepareRetraction(slot, 'superseded');
    expect('prepared' in withdrawal && withdrawal.prepared.relays).toEqual([TEAM_RELAY]);
  });

  it('queues a position that reached nobody with where it was going, and retries it only there', async () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    publishFindingMock.mockResolvedValue({ success: false, error: 'no relay reachable' });
    const ready = prepareCaseAdjudication(makeCase('limited'), OPTS);
    if (!('prepared' in ready)) throw new Error('expected a prepared position');

    expect((await publishPreparedAttestation(ready.prepared)).queued).toBe(true);
    expect((await publishOutbox.pending()).map((r) => r.relays)).toEqual([[TEAM_RELAY]]);

    delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    sentTo.length = 0;
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'evt-2', relaysOk: 1 });
    await drainFindingsOutbox();
    expect(sentTo).toContainEqual([TEAM_RELAY]);
    expect(sentTo.filter((r) => r && r.includes('wss://nos.lol'))).toEqual([]);
  });
});
