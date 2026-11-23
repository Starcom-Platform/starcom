/**
 * "Queued — not yet public" was kept in each panel's own state, so a reload
 * wiped it while the finding still sat in the outbox, and the button offered
 * to publish it again (plan item 9.4). The label now comes from the outbox:
 * what is waiting reads "queued", what it gave up on reads "given up".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signFinding } from '../../findings/signFinding';

vi.mock('../PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import { publishOutbox, MAX_ATTEMPTS } from '../PublishOutbox';
import { useWaitingFindings, claimsSlot, positionOfCase, refutesClaim } from '../waitingFindings';
import { caseAdjudicationAttribute } from '../../findings/caseAdjudication';

const keys = ml_dsa65.keygen();
const sign = (content: Record<string, unknown>) => signFinding(content as never, keys.secretKey);
const claimV1 = (entityRef: string, attribute: string) => sign({ schemaVersion: 1, claim: { entityRef, attribute, value: 'closed' }, confidence: 0.8, corroboration: { sourceCount: 2, algorithmVersion: 1, criteria: 'x' }, publishedAt: '2026-09-26T00:00:00.000Z' });
const claimV2 = (subjectRef: string, attribute: string) => sign({ schemaVersion: 2, claim: { subjectRef, subjectKind: 'place', attribute, value: 'open' }, publishedAt: '2026-09-26T00:00:00.000Z' });
const PEER = { authorPubkey: 'b'.repeat(64), subjectRef: 'Berth 4', attribute: 'status', publishedAt: '2026-09-20T00:00:00.000Z' };
const refutation = sign({ schemaVersion: 2, refutes: PEER, ground: 'contrary-evidence', publishedAt: '2026-09-26T00:00:00.000Z' });

beforeEach(async () => {
  for (const r of [...await publishOutbox.pending(), ...await publishOutbox.abandoned()]) await publishOutbox.cancel(r.id);
});

describe('matching an outbox record to what a row shows', () => {
  it('a finding by its subject and attribute, however the version names the subject', () => {
    expect(claimsSlot('Harbour crane', 'status')(claimV1('Harbour crane', 'status').content)).toBe(true);
    expect(claimsSlot('Harbour crane', 'status')(claimV2('Harbour crane', 'status').content)).toBe(true);
    expect(claimsSlot('Harbour crane', 'status')(claimV2('Harbour crane', 'location').content)).toBe(false);
    expect(claimsSlot('Berth 4', 'status')(refutation.content)).toBe(false);
  });

  it("a case's position by the case, whatever subject was typed for it", () => {
    const position = claimV2('whatever was typed', caseAdjudicationAttribute('CASE-2026-0007'));
    expect(positionOfCase('CASE-2026-0007')(position.content)).toBe(true);
    expect(positionOfCase('CASE-2026-0008')(position.content)).toBe(false);
  });

  it('a refutation by the claim it refutes', () => {
    expect(refutesClaim(PEER)(refutation.content)).toBe(true);
    expect(refutesClaim({ ...PEER, publishedAt: '2026-09-21T00:00:00.000Z' })(refutation.content)).toBe(false);
    expect(refutesClaim(PEER)(claimV2('Berth 4', 'status').content)).toBe(false);
  });
});

describe('useWaitingFindings', () => {
  it('says queued while it waits, given up once abandoned, and nothing once sent', async () => {
    const { result } = renderHook(() => useWaitingFindings());
    const crane = claimsSlot('Harbour crane', 'status');
    expect(result.current(crane)).toBeUndefined();

    await act(async () => { await publishOutbox.enqueue(claimV1('Harbour crane', 'status')); });
    await waitFor(() => expect(result.current(crane)).toBe('queued'));

    await act(async () => { for (let i = 0; i < MAX_ATTEMPTS; i++) await publishOutbox.drain(async () => ({ success: false, error: 'down' })); });
    await waitFor(() => expect(result.current(crane)).toBe('given-up'));

    const [gaveUp] = await publishOutbox.abandoned();
    await act(async () => { await publishOutbox.retry(gaveUp.id); await publishOutbox.drain(async () => ({ success: true })); });
    await waitFor(() => expect(result.current(crane)).toBeUndefined());
  });

  it('reads what was already waiting when it starts, as after a reload', async () => {
    await publishOutbox.enqueue(claimV1('Relay outage', 'cause'));
    const { result } = renderHook(() => useWaitingFindings());
    await waitFor(() => expect(result.current(claimsSlot('Relay outage', 'cause'))).toBe('queued'));
  });
});
