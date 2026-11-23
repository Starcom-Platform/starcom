/**
 * The one moment a person is told they are the publisher.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Starcom holds no signing key. `FindingsBroadcastService.signEvent` takes a
 * secret key the caller supplies or a NIP-07 browser extension, and throws if
 * it has neither. So when a finding is published, the signature is the
 * OPERATOR'S — not an organisation's, not this application's.
 *
 * Which means a person using this app personally publishes a signed,
 * broadcast, permanent assertion, sometimes about a named individual, under
 * their own key and in their own jurisdiction. `publicationPolicy` already
 * makes that a deliberate act inside the app — "it should never happen because
 * nobody thought about it" — but deliberation about the CLAIM is not the same
 * as knowing who is answerable for it.
 *
 * Navcom spent an entire design exchange establishing that their operators
 * need exactly one honest statement at the first publish, because there is no
 * account and no signup and that is the only moment available. Starcom's users
 * carry more than their operators do — an assertion about a person rather than
 * an observation about a place — and were being told less.
 *
 * ─── WHY ONCE, AND WHY IT BLOCKS ───────────────────────────────────────────
 *
 * Once, because a prompt that arrives every time is indistinguishable from
 * noise and gets dismissed unread — the same reasoning `decayedFindingProducer`
 * gives for asking once about a decayed claim rather than nagging from the
 * first week. A consent screen nobody reads is worse than none: it creates the
 * paperwork of having told somebody without the effect.
 *
 * Blocking, because a notice that can be scrolled past is a notice about
 * somebody else. It refuses through the mechanism that already exists for a
 * refused publication, so every caller handles it without new branches.
 *
 * ─── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 *
 * It is not a licence agreement, it is not legal advice, and it grants this
 * project nothing. It states four facts a publisher should not learn later.
 */

const STORAGE_KEY = 'starcom_publisher_acknowledged_v1';

/**
 * What the person is told. Exported so it is testable and reviewable as text
 * rather than buried in a component, and so it cannot drift from what the
 * system actually does without a test noticing.
 *
 * Each line is a fact about the architecture, verifiable from the source.
 */
export const PUBLISHER_ACKNOWLEDGEMENT = {
  title: 'You are the publisher',
  points: [
    'This is signed with your key, not with an organisation\'s. Starcom holds no signing key of its own.',
    'It goes to public relays other people operate. It is permanent, and nobody here can delete it.',
    'A published claim can be retracted — a withdrawal replaces it for anyone who queries again — but a reader who already cached it will not see the retraction.',
    'A claim about a named person carries the most risk, and is the one case this app already asks you to confirm separately.',
  ],
  /** Deliberately not a checkbox marked "I agree". Nothing is being agreed to. */
  confirm: 'I understand',
} as const;

export interface ConsentStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): ConsentStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Private mode, or storage blocked. Treated as "not acknowledged", which
    // shows the notice again rather than assuming it was seen.
    return null;
  }
}

/**
 * Keyed by publishing identity where one is known.
 *
 * The liability follows the key, so switching to a different key is a
 * different person answering for it and the statement is shown again. A caller
 * that cannot determine the key yet falls back to a single flag, which is
 * weaker and honest about being weaker.
 */
function slotFor(pubkey?: string): string {
  return pubkey ? `${STORAGE_KEY}:${pubkey}` : STORAGE_KEY;
}

function hasAcknowledged(pubkey?: string, store: ConsentStore | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    return store.getItem(slotFor(pubkey)) !== null;
  } catch {
    return false;
  }
}

export function acknowledge(pubkey?: string, store: ConsentStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(slotFor(pubkey), new Date().toISOString());
  } catch {
    /*
     * Storage refused. The acknowledgement does not persist, so the notice
     * appears again next time — which is the correct failure direction. The
     * alternative, treating a failed write as success, would silently stop
     * telling people.
     */
  }
}

/** The reason string a refused publish carries, so the UI can recognise it. */
const PUBLISHER_CONSENT_REASON =
  'This would be published under your own key. Read what that means before the first one.';

/**
 * Whether publication must stop and show the statement first.
 *
 * Returns a refusal in the shape `publishFinding` already uses, so no caller
 * needs a new branch to handle it.
 */
export function publisherConsentRefusal(
  pubkey?: string,
  store: ConsentStore | null = defaultStore(),
): { reason: string; requiresExplicitConsent: true } | null {
  return hasAcknowledged(pubkey, store)
    ? null
    : { reason: PUBLISHER_CONSENT_REASON, requiresExplicitConsent: true };
}
