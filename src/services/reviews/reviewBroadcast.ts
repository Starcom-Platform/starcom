/**
 * Sending and reading reviews (plan item 5.1).
 *
 * A review goes where its distribution sends it, asked every time (decision
 * D2): Limited to the team's internal relays, Public to the public ones too.
 * It travels on the findings channel, beside the corroborations and
 * refutations it is shown with, and is sent only through the publish review
 * (publishing/reviews.ts), which is the one caller of publishPreparedReview.
 *
 * Reading asks the relays that channel reads for comments and verdicts by the
 * item's address and version, and keeps only events whose signature holds and
 * that are about the item.
 */
import { verifyEvent, type Event } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { readRelays, whereItGoes } from '../nostr/publishTargets';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import {
  commentTemplate, verdictTemplate, readReview, reviewFilters,
  type ReviewEvent, type ReviewTarget, type Verdict,
} from './reviewEvents';

export type ReviewInput =
  | { type: 'comment'; text: string }
  | { type: 'verdict'; verdict: Verdict; reasoning: string };

/** Who may receive a review. Private has no meaning for something said about a published item. */
export type ReviewReach = 'public' | 'limited';

export interface PreparedReview {
  target: ReviewTarget;
  input: ReviewInput;
  reach: ReviewReach;
  /** Signed: exactly what the review shows is what is sent. */
  event: Event;
  relays: string[];
}

/**
 * Where reviews of an item travel: a package's on the mission relays, where
 * replies to it are already listened for; anything else's on the findings
 * relays, beside the corroborations and refutations it is shown with. Both
 * on findings relays, a comment on a package never reached a package author
 * whose missions and findings went to different relays.
 */
const channelFor = (target: ReviewTarget) => (target.kind === PROTOCOL_KINDS.MISSION_PACKAGE ? 'MISSION' as const : 'FINDING' as const);

export async function prepareReview(target: ReviewTarget, input: ReviewInput, reach: ReviewReach): Promise<PreparedReview> {
  const { relays, refusal } = whereItGoes(channelFor(target), reach, 'review');
  if (refusal) throw new Error(refusal);
  const template = input.type === 'comment'
    ? commentTemplate(target, input.text)
    : verdictTemplate(target, input.verdict, input.reasoning);
  // Reviewing is something a person does, so a key is made for it if need be.
  const event = await nostrIdentityService.asSigner().signEvent(template) as Event;
  return { target, input, reach, event, relays };
}

/** Sends a reviewed review. Called only from publishing/reviews.ts, after a yes. */
export async function publishPreparedReview(prepared: PreparedReview): Promise<{ relaysOk: number; relaysTried: number }> {
  const pool = createRelayPool();
  try {
    const results = await Promise.allSettled(pool.publish(prepared.relays, prepared.event));
    return { relaysOk: results.filter((r) => r.status === 'fulfilled').length, relaysTried: prepared.relays.length };
  } finally {
    pool.close(prepared.relays);
  }
}

/** The comments and verdicts on an item that the relays hold, each checked. */
export async function fetchReviews(target: ReviewTarget, maxWait = 4000): Promise<ReviewEvent[]> {
  const relays = readRelays(channelFor(target));
  if (relays.length === 0) return [];
  const pool = createRelayPool();
  try {
    const batches = await Promise.all(reviewFilters(target).map((filter) => pool.querySync(relays, filter, { maxWait })));
    const reviews: ReviewEvent[] = [];
    const seen = new Set<string>();
    for (const event of batches.flat()) {
      // One event answers both the address and the version filter.
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      // A JSON copy: nostr-tools caches a verify result on the object under a
      // symbol, which a spread copies, so an event changed after signing passed.
      if (!verifyEvent(JSON.parse(JSON.stringify(event)) as Event)) continue;
      const review = readReview(event, target);
      if (review) reviews.push(review);
    }
    return reviews;
  } finally {
    pool.close(relays);
  }
}
