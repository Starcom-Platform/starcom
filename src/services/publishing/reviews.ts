/**
 * A comment or verdict on a published item, published through the one publish
 * review like everything else (plan items 0.1 and 5.1): shown as it will go,
 * where it will go, and sent only on a yes.
 */
import { requestReview, type ReviewContent, type ReviewOutcome } from './publishReview';
import { nostrEventId } from './nostrEventId';
import { destinationsFor } from './destinations';
import {
  prepareReview, publishPreparedReview,
  type PreparedReview, type ReviewInput, type ReviewReach,
} from '../reviews/reviewBroadcast';
import type { ReviewTarget, Verdict } from '../reviews/reviewEvents';

const VERDICT_WORDS: Record<Verdict, string> = { confirmed: 'Confirmed', disputed: 'Disputed', 'needs-evidence': 'Needs evidence' };

function showReview(p: Readonly<PreparedReview>, itemTitle: string): ReviewContent {
  const version = p.target.eventId.slice(0, 12);
  if (p.input.type === 'comment') {
    return {
      title: `Comment on "${itemTitle}"`,
      body: p.input.text,
      fields: [
        { label: 'On', value: `${itemTitle}, the version published as ${version}…` },
        { label: 'Who may receive it', value: p.reach === 'public' ? 'Public' : 'Limited' },
      ],
      raw: JSON.stringify(p.event, null, 2),
    };
  }
  return {
    title: `${VERDICT_WORDS[p.input.verdict]}: "${itemTitle}"`,
    body: p.input.reasoning || 'No method stated: it will be shown as a verdict without what you checked.',
    fields: [
      { label: 'Verdict', value: VERDICT_WORDS[p.input.verdict] },
      { label: 'What you checked', value: p.input.reasoning || 'Not stated' },
      { label: 'On', value: `This version only (${version}…): a later edit of it does not carry your verdict` },
      { label: 'Who may receive it', value: p.reach === 'public' ? 'Public' : 'Limited' },
    ],
    raw: JSON.stringify(p.event, null, 2),
  };
}

/** Show a comment or verdict on a published item, and on a yes send exactly it. */
export async function reviewReview(
  target: ReviewTarget,
  itemTitle: string,
  input: ReviewInput,
  reach: ReviewReach,
): Promise<ReviewOutcome<{ relaysOk: number; relaysTried: number }>> {
  const prepared = await prepareReview(target, input, reach);
  return requestReview<PreparedReview, { relaysOk: number; relaysTried: number }>({
    act: input.type === 'comment' ? 'Publish comment' : 'Publish verdict',
    payload: prepared,
    show: (p) => showReview(p, itemTitle),
    destinations: destinationsFor(prepared.relays),
    digest: (p) => nostrEventId(p.event),
    signer: prepared.event.pubkey,
    send: (p) => publishPreparedReview(p as PreparedReview),
  });
}
