/**
 * Findings through the publish review (plan item 0.1).
 *
 * The fingerprint shown is the digest the ML-DSA signature covers, and what is
 * signed is exactly what was shown. The gates run first: a refused finding, or
 * a withdrawal of a claim never made, opens no review at all.
 *
 * Real signing and a real outbox; only the relay broadcast is mocked, and it
 * captures the signed payload so the signature can be checked against the
 * review.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import type { CorroboratedFinding } from '../../../applications/intelanalyzer/state/correlationUtils';

const broadcast = vi.fn();
vi.mock('../../intel/findings/FindingsBroadcastService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intel/findings/FindingsBroadcastService')>();
  return {
    ...actual,
    FindingsBroadcastService: class {
      publishFinding(...args: unknown[]) { return broadcast(...args); }
      dispose() {}
    },
  };
});

import { reviewFinding, reviewRetraction } from '../findings';
import { currentReview, decideReview } from '../publishReview';
import { acknowledge } from '../../intel/findings/publisherConsent';
import { contentDigest, verifyFindingSignature, type SignedFinding } from '../../intel/findings/signFinding';

beforeEach(() => {
  acknowledge();
  broadcast.mockReset();
});

afterEach(async () => {
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((r) => setTimeout(r, 0));
  }
});

const finding = (overrides: Partial<CorroboratedFinding> = {}): CorroboratedFinding => ({
  entityRef: 'Newark food bank 3',
  attribute: 'status',
  value: 'closed',
  confidence: 0.8,
  sourceCount: 2,
  algorithmVersion: 2,
  isMock: false,
  ...overrides,
});

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  // The first publish from a key must carry the publisher acknowledgement.
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

describe('reviewFinding', () => {
  it('shows the finding, and the signature covers exactly what was shown', async () => {
    broadcast.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 3 });

    const outcome = reviewFinding(finding());
    const shown = await answer(true);
    const result = await outcome;

    expect(shown.act).toBe('Publish finding');
    expect(shown.content.title).toBe('Newark food bank 3 — status');
    expect(shown.content.body).toBe('closed');
    expect(result?.broadcast.success).toBe(true);
    const signed = broadcast.mock.calls[0][0] as SignedFinding;
    expect(bytesToHex(contentDigest(signed.content))).toBe(shown.digest);
    expect(verifyFindingSignature(signed)).toBe(true);
  });

  it('signs and sends nothing when the review is cancelled', async () => {
    const outcome = reviewFinding(finding());
    await answer(false);

    expect(await outcome).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('opens no review for a finding the publication gate refuses', async () => {
    const result = await reviewFinding(finding({ isMock: true }));

    expect(result?.refused).toBeTruthy();
    expect(currentReview()).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('reviewRetraction', () => {
  it('opens no review to withdraw a claim this instance never made', async () => {
    const result = await reviewRetraction('slot-that-was-never-published', 'decayed');

    expect(result).toEqual({ retracted: false, reason: 'not-published' });
    expect(currentReview()).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
