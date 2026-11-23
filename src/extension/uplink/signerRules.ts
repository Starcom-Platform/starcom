/**
 * When Uplink asks before it signs (decision D-EX, E3, EX41): before anything public, and never for what
 * is private or passing. Published reports, claims, packages and posts ask, showing what and why. Direct
 * messages, sealed and wrapped chat, relay sign-in, and Starcom's ephemeral kinds, which no relay keeps,
 * sign quietly. A kind Uplink does not know asks: what it cannot name it does not sign unseen.
 *
 * Pure, so both sides and their tests import it as it is.
 */
import { APP_KINDS, UNGOVERNED_KINDS } from '../../services/nostr/kindRegistry';
import { interpolate } from '../../i18n/messages';
import { uplinkEn, type UplinkMessages } from '../../i18n/uplink/en';

/** Kinds signed without asking: private, sealed, or passing. Every signature is logged all the same. */
export const QUIET_KINDS: ReadonlySet<number> = new Set([
  UNGOVERNED_KINDS.ENCRYPTED_DM,
  13, // NIP-59 seal
  14, // NIP-17 chat message, sealed before it leaves
  1059, // NIP-59 gift wrap
  22242, // NIP-42 signing in to a relay
  APP_KINDS.TEAM_INVITE, APP_KINDS.TEAM_ACCESS_REQUEST, APP_KINDS.RECORD_BUNDLE, APP_KINDS.RECORD_BUNDLE_PART,
  APP_KINDS.CHAT_MESSAGE, APP_KINDS.RELAY_PROBE, APP_KINDS.EVIDENCE_CUSTODY, APP_KINDS.PORTFOLIO_ATTESTATION,
]);

/** Whether Uplink asks the person before signing this kind. */
export const asksFirst = (kind: number): boolean => !QUIET_KINDS.has(kind);


/** A kind in the person's words. */
export const kindWords = (kind: number, words: UplinkMessages = uplinkEn): string =>
  (words.kinds as Partial<Record<string, string>>)[String(kind)] ?? interpolate(words.unknownKind, { kind });

/** The most an event's words may be, and its tags. */
const MAX_CONTENT = 256 * 1024;
const MAX_TAGS = 2000;

/** Why an event will not be signed as given, or null when it will. */
export function unsignedProblem(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return 'There is no event to sign.';
  const e = event as Record<string, unknown>;
  if (!Number.isInteger(e.kind) || (e.kind as number) < 0 || (e.kind as number) > 65535) return 'An event\'s kind is a whole number from 0 to 65535.';
  if (!Number.isInteger(e.created_at) || (e.created_at as number) < 0) return 'An event\'s time is whole seconds.';
  if (!Array.isArray(e.tags) || e.tags.length > MAX_TAGS || !e.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === 'string'))) {
    return 'An event\'s tags are lists of words.';
  }
  if (typeof e.content !== 'string') return 'An event\'s content is words.';
  if (e.content.length > MAX_CONTENT) return 'The event is longer than Uplink signs.';
  return null;
}
