import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));

// The panels navigate now; mock the router the same way CorroborationGapsPanel's
// suite does rather than wrapping every panel test in the whole provider.
const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

type Peer = {
  entityRef: string; attribute: string; authorPubkey: string; publishedAt: string;
  subjectKind: string; weight: number; independence: string; corroborationValue: number;
};
type Contested = {
  subjectRef: string; attribute: string; authorPubkey: string; mine: boolean;
  state: string; refutations: number; grounds: string[];
};

let foreignAgreement: Peer[] = [];
let contested: Contested[] = [];
let corroboratedFindings: Array<{ entityRef: string; attribute: string }> = [];

vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ foreignAgreement, contested, corroboratedFindings }),
}));

const refuteMock = vi.fn();
// Refuting goes through the publish review (plan item 0.1); here it answers as
// a confirm would.
vi.mock('../../../../services/publishing/findings', () => ({
  reviewRefutation: (...args: unknown[]) => refuteMock(...args),
}));

// "Queued" is what the outbox holds (plan item 9.4), so the outbox is a real one, in memory.
vi.mock('../../../../services/intel/outbox/PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/intel/outbox/PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../../../../services/intel/outbox/OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import PeerClaimsPanel from '../PeerClaimsPanel';
import { publishOutbox } from '../../../../services/intel/outbox/PublishOutbox';
import { signFinding } from '../../../../services/intel/findings/signFinding';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const PEER: Peer = {
  entityRef: 'John Smith', attribute: 'location',
  authorPubkey: 'b'.repeat(64), publishedAt: '2026-08-17T00:00:00.000Z',
  subjectKind: 'person', weight: 0.62, independence: 'independent', corroborationValue: 0.4,
};

beforeEach(() => {
  foreignAgreement = []; contested = []; corroboratedFindings = [];
  refuteMock.mockReset();
  refuteMock.mockResolvedValue({ broadcast: { success: true }, queued: false });
});

describe('PeerClaimsPanel', () => {
  it('stays quiet when there are no peer claims and nothing is contested', () => {
    const { container } = render(<PeerClaimsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('will not offer to refute without local evidence of our own', () => {
    foreignAgreement = [PEER];
    render(<PeerClaimsPanel />);
    // A refutation carrying no weighable method is refused by every conforming
    // node, so offering the control here would be offering a dead end.
    expect(screen.queryByRole('button', { name: /refute/i })).toBeNull();
    expect(screen.getByText(/refuting requires evidence of your own/i)).toBeTruthy();
  });

  it('refutes the exact version of the claim, not the peer or the subject', async () => {
    foreignAgreement = [PEER];
    corroboratedFindings = [{ entityRef: 'John Smith', attribute: 'location' }];
    render(<PeerClaimsPanel />);

    await userEvent.click(screen.getByRole('button', { name: /refute/i }));

    await waitFor(() => expect(refuteMock).toHaveBeenCalledTimes(1));
    const [refutes, ground, evidence, subjectKind] = refuteMock.mock.calls[0];
    expect(refutes).toEqual({
      subjectRef: 'John Smith',
      attribute: 'location',
      authorPubkey: PEER.authorPubkey,
      // Their publishedAt, so the refutation cannot silently apply to a later
      // revision that fixed the very problem being argued with.
      publishedAt: PEER.publishedAt,
    });
    expect(ground).toBe('contradicting-evidence');
    expect(evidence).toEqual(corroboratedFindings[0]);
    // The gate keys on this and the refutation payload does not carry it.
    expect(subjectKind).toBe('person');
  });

  it('surfaces a refusal reason rather than a button that stopped working', async () => {
    foreignAgreement = [PEER];
    corroboratedFindings = [{ entityRef: 'John Smith', attribute: 'location' }];
    refuteMock.mockResolvedValue({
      broadcast: { success: false }, queued: false,
      refused: { reason: 'subject is a named individual', requiresExplicitConsent: true },
    });
    render(<PeerClaimsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /refute/i }));
    await waitFor(() => expect(screen.getByText(/named individual/i)).toBeTruthy());
  });

  it('distinguishes queued from published, because queued is not public', async () => {
    foreignAgreement = [PEER];
    corroboratedFindings = [{ entityRef: 'John Smith', attribute: 'location' }];
    // As the real path does: no relay took it, so it went into the outbox.
    refuteMock.mockImplementation(async () => {
      await publishOutbox.enqueue(signFinding({
        schemaVersion: 2,
        refutes: { authorPubkey: PEER.authorPubkey, subjectRef: PEER.entityRef, attribute: PEER.attribute, publishedAt: PEER.publishedAt },
        ground: 'contradicting-evidence', publishedAt: '2026-09-26T00:00:00.000Z',
      } as never, ml_dsa65.keygen().secretKey));
      return { broadcast: { success: false }, queued: true };
    });
    render(<PeerClaimsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /refute/i }));
    await waitFor(() => expect(screen.getByText(/not yet public/i)).toBeTruthy());
  });

  it('shows a refutation of our own claim before other people arguments', () => {
    contested = [
      { subjectRef: 'Acme', attribute: 'location', authorPubkey: 'c'.repeat(64), mine: false,
        state: 'contested', refutations: 1, grounds: ['source-defect'] },
      { subjectRef: 'John Smith', attribute: 'location', authorPubkey: 'd'.repeat(64), mine: true,
        state: 'refuted', refutations: 2, grounds: ['contradicting-evidence'] },
    ];
    render(<PeerClaimsPanel />);
    const text = document.body.textContent ?? '';
    // Ours leads. An interface that buries a refutation of its own claim among
    // other people's arguments reports consensus it has not got.
    expect(text.indexOf('John Smith')).toBeLessThan(text.indexOf('Acme'));
    expect(screen.getByText('our claim')).toBeTruthy();
  });
});
