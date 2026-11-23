/**
 * Whether what a row shows is waiting in the outbox (plan item 9.4).
 *
 * "Queued — not yet public" was kept in each panel's own state, so a reload
 * wiped it while the finding still sat in the outbox, and the button offered to
 * publish it again. The label now comes from the outbox itself: a record still
 * waiting reads `queued`, one the outbox gave up on reads `given-up`, and one
 * sent, cancelled or never queued reads nothing.
 *
 * Rows are matched by what the signed record says, not by a key a panel made
 * up: a case's position, for one, is published under a subject typed at the
 * time, which a reload does not keep, but its attribute names the case.
 */
import { useEffect, useState } from 'react';
import { publishOutbox } from './PublishOutbox';
import type { OutboxRecord } from './OutboxTypes';
import { caseAdjudicationAttribute } from '../findings/caseAdjudication';

export type WaitingState = 'queued' | 'given-up';

type Content = {
  claim?: { subjectRef?: string; entityRef?: string; attribute?: string };
  refutes?: { authorPubkey?: string; subjectRef?: string; attribute?: string; publishedAt?: string };
  retracts?: unknown;
};
export type WaitingMatch = (content: Content) => boolean;

/** A finding about this subject and attribute: v1 names the subject entityRef, v2 subjectRef. */
export const claimsSlot = (subjectRef: string, attribute: string): WaitingMatch => (c) =>
  !c.refutes && !c.retracts && (c.claim?.subjectRef ?? c.claim?.entityRef) === subjectRef && c.claim?.attribute === attribute;

/** A case's position, whatever subject was typed for it. */
export const positionOfCase = (caseNumber: string): WaitingMatch => (c) =>
  !c.refutes && !c.retracts && c.claim?.attribute === caseAdjudicationAttribute(caseNumber);

/** A refutation of this claim: whose it is, what about, and which of theirs. */
export const refutesClaim = (claim: { authorPubkey: string; subjectRef: string; attribute: string; publishedAt: string }): WaitingMatch => (c) =>
  c.refutes?.authorPubkey === claim.authorPubkey && c.refutes?.subjectRef === claim.subjectRef
  && c.refutes?.attribute === claim.attribute && c.refutes?.publishedAt === claim.publishedAt;

/** What the outbox holds for a row, waiting before given up. */
function waitingStateOf(records: readonly OutboxRecord[], matches: WaitingMatch): WaitingState | undefined {
  const mine = records.filter((r) => matches(r.payload.content as Content));
  if (mine.some((r) => r.status === 'pending')) return 'queued';
  if (mine.some((r) => r.status === 'abandoned')) return 'given-up';
  return undefined;
}

/**
 * A publish button's state: what this session did, except whether it waits,
 * which is the outbox's to say. Waiting is queued; given up is an error to retry.
 *
 * A panel's own "queued" used to outrank the outbox, so a finding the outbox
 * later sent, or gave up on, still read "Queued" until a reload (found checking
 * 9.4 in a browser).
 */
export function withOutbox<S extends string>(local: S | undefined, waiting: WaitingState | undefined): S | 'queued' | 'error' | 'idle' {
  if (local !== undefined && local !== 'queued' && local !== 'idle') return local;
  return waiting === 'queued' ? 'queued' : waiting === 'given-up' ? 'error' : 'idle';
}

/** Ask of any row whether the outbox holds it; follows the outbox as it changes. */
export function useWaitingFindings(): (matches: WaitingMatch) => WaitingState | undefined {
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => {
      Promise.all([publishOutbox.pending(), publishOutbox.abandoned()])
        .then(([waiting, givenUp]) => { if (live) setRecords([...waiting, ...givenUp]); })
        .catch(() => { if (live) setRecords([]); });
    };
    load();
    const stop = publishOutbox.onChange(load);
    return () => { live = false; stop(); };
  }, []);
  return (matches) => waitingStateOf(records, matches);
}
