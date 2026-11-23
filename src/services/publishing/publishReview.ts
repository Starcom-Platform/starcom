/**
 * One review before anything is published (plan item 0.1, story S20).
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Twelve places in the app sent content to relays or IPFS. Only mission
 * publishing warned first, NetRunner asked with the browser's confirm(), and
 * none showed what would be sent or where. A relay publish cannot be recalled.
 *
 * ─── WHAT A REVIEW IS ──────────────────────────────────────────────────────
 *
 * A request carries the payload exactly as it will be signed. The review:
 *
 *   - freezes a copy of it, so what was reviewed is what is sent, whatever
 *     happens to the caller's object afterwards;
 *   - fingerprints it with the digest the signer will sign, so the person and
 *     the signature are talking about the same bytes;
 *   - shows it as the kind renders it from that frozen copy, never from
 *     anything else;
 *   - names where it goes, and words the confirm button as the act and the
 *     destination ("Publish Mission Package to 5 public relays");
 *   - points out what is easy to miss: coordinates, addresses, emails, phone
 *     numbers and long numbers.
 *
 * Nothing is sent until the person confirms. Cancelling sends nothing.
 *
 * ─── WHO CALLS THIS ────────────────────────────────────────────────────────
 *
 * Only the modules beside it in services/publishing/, one per kind of publish.
 * They are the only code allowed to call a publishing entry point
 * (guard-publish-review.mjs), so a screen cannot publish without a review.
 *
 * Reviews are shown one at a time, by PublishReviewRoot. A second request
 * waits its turn rather than replacing the first.
 */
import { sha256 } from '@noble/hashes/sha256';
import { UNDER_13_REFUSAL, ageAnswer, ageAskable, ageBeforeSigning, isUnder13 } from '../identity/ageAnswer';
import { bytesToHex } from '@noble/hashes/utils';
import { publisherConsentRefusal, acknowledge, PUBLISHER_ACKNOWLEDGEMENT } from '../intel/findings/publisherConsent';
import { keyMayExistOnlyHere } from '../identity/identityNotice';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { SAMPLE_REFUSAL } from '../intel/sampleRecords';
import { jobs } from '../jobs/jobRegistry';

export type DestinationKind = 'public' | 'internal' | 'local' | 'ipfs';

export interface Destination {
  /** A relay URL, or 'IPFS'. */
  address: string;
  kind: DestinationKind;
}

export interface ReviewContent {
  /** What a reader meets first. */
  title: string;
  /** The words that will be published, as they will read. */
  body: string;
  /** Everything else that travels with it. */
  fields: Array<{ label: string; value: string }>;
  /** The payload exactly as it will be sent, for anyone who wants every byte. */
  raw?: string;
}

export type HighlightKind = 'coordinates' | 'address' | 'email' | 'phone' | 'long-number';

export interface Highlight {
  kind: HighlightKind;
  text: string;
}

export interface ReviewSpec<P, R> {
  /** The act, as the confirm button says it: "Publish Mission Package". */
  act: string;
  /** Exactly what will be signed. Frozen at review. */
  payload: P;
  /** Renders the frozen payload for reading. Must read nothing else. */
  show: (payload: Readonly<P>) => ReviewContent;
  destinations: Destination[];
  /** The digest the signer will sign, computed from the frozen payload. */
  digest: (payload: Readonly<P>) => string;
  /** What the fingerprint is of, when nothing is signed before it is sent. */
  digestLabel?: string;
  /** Something the person must weigh before confirming, shown above everything else. */
  notice?: string;
  /** The public key that will sign, when known. */
  signer: string | null;
  /** Sample or tutorial material is never published (plan item 0.9). */
  sample?: boolean;
  /**
   * Sealed to one key by NIP-59 (a mission report, D-MF MF11): the relays hold a sealed message, never what it
   * says, so nothing readable goes public and "you are the publisher" is not asked for it.
   */
  sealed?: boolean;
  /** Sends the frozen payload. Called only after the person confirms. */
  send: (payload: Readonly<P>) => Promise<R>;
}

export type ReviewOutcome<R> =
  | { status: 'sent'; result: R }
  | { status: 'cancelled' }
  | { status: 'refused'; reason: string };

/** What the dialog shows. Holds no payload, only what was rendered from it. */
export interface PendingReview {
  id: string;
  act: string;
  content: ReviewContent;
  destinations: Destination[];
  confirmLabel: string;
  highlights: Highlight[];
  digest: string;
  digestLabel: string;
  notice: string | null;
  signer: string | null;
  state: 'deciding' | 'sending';
  firstPublish: FirstPublish;
  /** Sealed to one key: its relays hold it, never what it says. */
  sealed: boolean;
}

/**
 * What the review asks the first time a key publishes (plan item 0.1).
 *
 * Both used to live elsewhere or nowhere: the publisher statement only in the
 * analyzer's findings panel, so a case position from a fresh profile was
 * refused with no way to acknowledge it; and the key backup prompt only as an
 * intention (plan item 0.8). The review is the one place every publish passes.
 */
export interface FirstPublish {
  /**
   * "You are the publisher", when this key has not been told yet. A confirm must
   * carry the person's acknowledgement, and the review records it for this key.
   */
  acknowledgement: typeof PUBLISHER_ACKNOWLEDGEMENT | null;
  /** True when the signing key lives only in this browser and was never kept. A prompt, not a gate. */
  backup: boolean;
}

function firstPublishFor(signer: string | null, destinations: readonly Destination[], sealed = false): FirstPublish {
  const local = signer !== null && !nostrIdentityService.hasExtension() && nostrIdentityService.getPubkey() === signer;
  // The statement is about public relays and IPFS, where anyone reads it and
  // nothing recalls it. Said of a send to internal relays only, such as a
  // bundle sealed to a teammate (plan item 2.4), it is not true; asked there,
  // it would be asked again, and rightly, at the key's first public publish.
  // Nor of a message sealed to one key: a public relay holds it, and nobody else can read it.
  const goesPublic = !sealed && destinations.some((d) => d.kind === 'public' || d.kind === 'ipfs');
  return {
    acknowledgement: goesPublic && publisherConsentRefusal(signer ?? undefined) ? PUBLISHER_ACKNOWLEDGEMENT : null,
    backup: local && keyMayExistOnlyHere(),
  };
}

// ── the pure parts ──────────────────────────────────────────────────────────

/** A deep copy that nothing can change: what was reviewed is what is sent. */
export function freeze<P>(payload: P): Readonly<P> {
  const copy = structuredClone(payload);
  const deepFreeze = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  };
  deepFreeze(copy);
  return copy;
}

/** SHA-256 of a string, in hex: the fingerprint shape the signers here use. */
export function sha256Hex(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The confirm button: the act and where it goes. "Publish Mission Package to
 * 5 public relays"; "… to 2 public relays, 1 internal relay and IPFS".
 */
export function confirmLabel(act: string, destinations: Destination[]): string {
  const relays = (kind: DestinationKind) => destinations.filter((d) => d.kind === kind).length;
  const parts = [
    relays('public') && plural(relays('public'), 'public relay'),
    relays('internal') && plural(relays('internal'), 'internal relay'),
    relays('local') && plural(relays('local'), 'local relay'),
    destinations.some((d) => d.kind === 'ipfs') && 'IPFS',
  ].filter((p): p is string => typeof p === 'string');
  if (parts.length === 0) return `${act}: nowhere to send it`;
  const where = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${act} to ${where}`;
}

const PATTERNS: Array<{ kind: HighlightKind; re: RegExp }> = [
  // A decimal pair a map would accept: "40.7357, -74.1724".
  { kind: 'coordinates', re: /-?\d{1,3}\.\d{2,}\s*[,;]\s*-?\d{1,3}\.\d{2,}/g },
  // A street address. The full stop belongs to an abbreviation ("St."), not to "Street.".
  { kind: 'address', re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:(?:Street|Avenue|Road|Boulevard|Lane|Drive|Place|Court|Way)\b|(?:St|Ave|Rd|Blvd|Ln|Dr|Pl|Ct)\b\.?)/g },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: 'phone', re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g },
  { kind: 'long-number', re: /\b\d{6,}\b/g },
];

/**
 * What is easy to miss in text about to be published. A span found by an
 * earlier pattern (a phone number) is not reported again by a later one (a
 * long number).
 */
export function findHighlights(text: string): Highlight[] {
  const taken: Array<[number, number]> = [];
  const found: Highlight[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      found.push({ kind, text: m[0].trim() });
    }
  }
  return found;
}

// ── the queue the dialog reads ──────────────────────────────────────────────

interface Entry {
  view: PendingReview;
  decide: (answer: { confirmed: boolean; acknowledged: boolean }) => void;
}

const queue: Entry[] = [];
const listeners = new Set<(review: PendingReview | null) => void>();
let nextId = 1;

const notify = () => {
  const current = queue[0]?.view ?? null;
  for (const listener of listeners) listener(current);
};

/** The review on screen now, if any. */
export function currentReview(): PendingReview | null {
  return queue[0]?.view ?? null;
}

export function subscribeReview(listener: (review: PendingReview | null) => void): () => void {
  listeners.add(listener);
  listener(currentReview());
  return () => { listeners.delete(listener); };
}

/**
 * The person's answer to the review on screen. Ignored for any other id, and a
 * confirm is ignored while the publisher statement stands unacknowledged.
 */
export function decideReview(id: string, confirmed: boolean, options: { acknowledged?: boolean } = {}): void {
  const entry = queue[0];
  if (!entry || entry.view.id !== id || entry.view.state !== 'deciding') return;
  const acknowledged = options.acknowledged === true;
  if (confirmed && entry.view.firstPublish.acknowledgement && !acknowledged) return;
  entry.decide({ confirmed, acknowledged });
}

/**
 * Show a review and wait for the answer. Sends the frozen payload only on
 * confirmation, and resolves with what happened.
 */
export async function requestReview<P, R>(spec: ReviewSpec<P, R>): Promise<ReviewOutcome<R>> {
  if (spec.sample) {
    return { status: 'refused', reason: SAMPLE_REFUSAL };
  }
  // Frozen as called, before anything is awaited: what is signed is what was asked to be reviewed.
  const frozen = freeze(spec.payload);
  const content = spec.show(frozen);
  // Under 13, nothing is posted; before a first key, how old is asked first (D-RS, RS39). Awaited only when
  // asking, so a review is queued as it is called otherwise.
  if (isUnder13()) return { status: 'refused', reason: UNDER_13_REFUSAL };
  if (!spec.signer && !ageAnswer() && ageAskable()) {
    const age = await ageBeforeSigning(true);
    if (!age.ok) return 'reason' in age ? { status: 'refused', reason: age.reason } : { status: 'cancelled' };
  }
  const view: PendingReview = {
    id: `review-${nextId++}`,
    act: spec.act,
    content,
    destinations: spec.destinations.map((d) => ({ ...d })),
    confirmLabel: confirmLabel(spec.act, spec.destinations),
    highlights: findHighlights([content.title, content.body, ...content.fields.map((f) => f.value)].join('\n')),
    digest: spec.digest(frozen),
    digestLabel: spec.digestLabel ?? 'Fingerprint of what will be signed',
    notice: spec.notice ?? null,
    signer: spec.signer,
    state: 'deciding',
    firstPublish: firstPublishFor(spec.signer, spec.destinations, spec.sealed),
    sealed: spec.sealed === true,
  };

  const { confirmed, acknowledged } = await new Promise<{ confirmed: boolean; acknowledged: boolean }>((resolve) => {
    queue.push({ view, decide: resolve });
    notify();
  });

  const entry = queue[0];
  const done = () => {
    queue.shift();
    notify();
  };

  if (!confirmed) {
    done();
    return { status: 'cancelled' };
  }

  if (acknowledged && view.firstPublish.acknowledgement) acknowledge(spec.signer ?? undefined);
  entry.view = { ...entry.view, state: 'sending' };
  notify();
  // On the job rail from here until it ends (BD13): the send, not the reading.
  const job = jobs.start({ kind: 'publish', label: spec.act });
  try {
    const result = await spec.send(frozen);
    // A send no relay took is not done, whatever the caller makes of it.
    const broadcast = (result as { broadcast?: { success?: boolean } } | null)?.broadcast;
    // Kept on this device, to go when a relay answers (W1): not sent yet, and not failed either.
    if ((result as { kept?: boolean } | null)?.kept === true) job.done('kept until a relay answers');
    else if (broadcast && broadcast.success === false) job.fail('no relay took it');
    else job.done('sent');
    return { status: 'sent', result };
  } catch (error) {
    job.fail(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    done();
  }
}
