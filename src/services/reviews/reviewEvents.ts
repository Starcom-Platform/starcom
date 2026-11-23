/**
 * Reviews after publishing (plan item 5.1, peer-sign-off-and-reviews.md).
 *
 * Publishing is not verification (decision D3), and nothing waits for
 * approval. Once an item is out, anyone can say something about it: a comment
 * (NIP-22, kind 1111) or a verdict (NIP-32, kind 1985). Both point at the item
 * by its address and at the exact version they read, because a verdict must
 * not carry over to a later edit of an addressable item (NIP-72's rule for
 * approvals).
 *
 * What comes back is who said what: each reviewer's latest verdict, whether
 * they said what they checked, and what is known of their key. Never a score:
 * refusal R-6 rules out any trust figure, and several reviewers do not add up
 * to a weight.
 *
 * nostr-tools 2.25 parses NIP-22 but builds neither, so the events are built
 * here, by hand.
 */
import type { Event, EventTemplate, Filter } from 'nostr-tools';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';

export const REVIEW_NAMESPACE = 'starcom.review';
export const VERDICTS = ['confirmed', 'disputed', 'needs-evidence'] as const;
export type Verdict = typeof VERDICTS[number];

const COMMENT = PROTOCOL_KINDS.NIP22_COMMENT;
const LABEL = PROTOCOL_KINDS.NIP32_LABEL;

/** A published item, by its address and the exact version being reviewed. */
export interface ReviewTarget {
  /** The item's own kind. */
  kind: number;
  /** The key that published it (hex). */
  author: string;
  /** kind:pubkey:d, for an addressable item. */
  coordinate?: string;
  /** The exact version reviewed. */
  eventId: string;
  /** Where the item was seen, as a hint for readers. */
  relay?: string;
}

export type ReviewEvent =
  | { type: 'comment'; id: string; author: string; at: number; text: string }
  | { type: 'verdict'; id: string; author: string; at: number; verdict: Verdict; reasoning: string; version: string };

/** What is known of a reviewer's key: shown beside what they said, never weighed. */
export type Provenance = 'you' | 'teammate' | 'known' | 'unknown';

const hint = (target: ReviewTarget) => (target.relay ? [target.relay] : []);

/** A top-level comment on the item: its root and its parent are both the item. */
export function commentTemplate(target: ReviewTarget, text: string): EventTemplate {
  if (!text.trim()) throw new Error('A comment cannot be empty.');
  const tags: string[][] = [];
  for (const [upper, lower] of [['A', 'a'], ['E', 'e'], ['K', 'k'], ['P', 'p']] as const) {
    const value = upper === 'A' ? target.coordinate : upper === 'E' ? target.eventId : upper === 'K' ? String(target.kind) : target.author;
    if (!value) continue;
    const extra = upper === 'K' ? [] : hint(target);
    tags.push([upper, value, ...extra], [lower, value, ...extra]);
  }
  return { kind: COMMENT, created_at: Math.floor(Date.now() / 1000), tags, content: text.trim() };
}

/** A verdict on the exact version: confirmed, disputed or needs evidence, with what was checked. */
export function verdictTemplate(target: ReviewTarget, verdict: Verdict, reasoning: string): EventTemplate {
  if (!VERDICTS.includes(verdict)) throw new Error(`Not a verdict Starcom knows: ${String(verdict)}.`);
  const tags: string[][] = [
    ['L', REVIEW_NAMESPACE],
    ['l', verdict, REVIEW_NAMESPACE],
    ...(target.coordinate ? [['a', target.coordinate, ...hint(target)]] : []),
    ['e', target.eventId, ...hint(target)],
    ['p', target.author],
  ];
  return { kind: LABEL, created_at: Math.floor(Date.now() / 1000), tags, content: reasoning.trim() };
}

const first = (event: Pick<Event, 'tags'>, name: string) => event.tags.find((t) => t[0] === name)?.[1];

/** Whether an event points at this item: by its address, or by a version of it. */
function pointsAt(event: Pick<Event, 'tags'>, target: ReviewTarget, address: string, version: string): boolean {
  const a = first(event, address);
  if (target.coordinate && a) return a === target.coordinate;
  return first(event, version) === target.eventId;
}

/**
 * A comment or verdict about this item, or null. Signatures are the reader's
 * to check before this; this checks what the event says it is about.
 */
export function readReview(event: Event, target: ReviewTarget): ReviewEvent | null {
  if (event.kind === COMMENT) {
    if (!pointsAt(event, target, 'A', 'E') || !event.content.trim()) return null;
    return { type: 'comment', id: event.id, author: event.pubkey, at: event.created_at, text: event.content.trim() };
  }
  if (event.kind === LABEL) {
    // The l tag names its namespace; a label in any other is not a review.
    const label = event.tags.find((t) => t[0] === 'l' && t[2] === REVIEW_NAMESPACE)?.[1];
    if (!label || !(VERDICTS as readonly string[]).includes(label)) return null;
    // Pinned to a version, or it would carry over to every later edit.
    const version = first(event, 'e');
    if (!version || !pointsAt(event, target, 'a', 'e')) return null;
    return { type: 'verdict', id: event.id, author: event.pubkey, at: event.created_at, verdict: label as Verdict, reasoning: event.content.trim(), version };
  }
  return null;
}

/** What to ask relays for: comments and verdicts by the item's address and by its version. */
export function reviewFilters(target: ReviewTarget): Filter[] {
  return [
    ...(target.coordinate ? [{ kinds: [COMMENT], '#A': [target.coordinate] }, { kinds: [LABEL], '#a': [target.coordinate] }] : []),
    { kinds: [COMMENT], '#E': [target.eventId] },
    { kinds: [LABEL], '#e': [target.eventId] },
  ];
}

export interface VerdictEntry {
  author: string;
  provenance: Provenance;
  at: number;
  verdict: Verdict;
  reasoning: string;
  /** Whether they said what they checked. */
  methodStated: boolean;
  /** Given on the version shown now; one given on an earlier version does not carry over. */
  onThisVersion: boolean;
}

export interface ReviewSummary {
  comments: Array<{ id: string; author: string; provenance: Provenance; at: number; text: string }>;
  /** Each reviewer once, by their latest verdict. */
  verdicts: Record<Verdict, VerdictEntry[]>;
}

export function summarizeReviews(
  target: ReviewTarget,
  reviews: ReviewEvent[],
  provenanceOf: (pubkey: string) => Provenance,
): ReviewSummary {
  const seen = new Set<string>();
  const unique = reviews.filter((r) => !seen.has(r.id) && seen.add(r.id));
  const comments = unique
    .filter((r): r is Extract<ReviewEvent, { type: 'comment' }> => r.type === 'comment')
    .sort((a, b) => a.at - b.at)
    .map((c) => ({ id: c.id, author: c.author, provenance: provenanceOf(c.author), at: c.at, text: c.text }));
  const latest = new Map<string, Extract<ReviewEvent, { type: 'verdict' }>>();
  for (const r of unique) {
    if (r.type !== 'verdict') continue;
    const had = latest.get(r.author);
    if (!had || r.at > had.at) latest.set(r.author, r);
  }
  const verdicts: Record<Verdict, VerdictEntry[]> = { confirmed: [], disputed: [], 'needs-evidence': [] };
  for (const v of [...latest.values()].sort((a, b) => b.at - a.at)) {
    verdicts[v.verdict].push({
      author: v.author, provenance: provenanceOf(v.author), at: v.at, verdict: v.verdict, reasoning: v.reasoning,
      methodStated: v.reasoning.length > 0, onThisVersion: v.version === target.eventId,
    });
  }
  return { comments, verdicts };
}
