import {
  NAVCOM_SURFACE_RELAYS, FEDERATION_READ_RELAYS, CHAT_PROVIDER_RELAYS, EXTRA_PUBLIC_RELAYS, THE_RECORD_RELAY,
  RELAY_MIRRORS,
} from '../../config/publicInfrastructure';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import { isJoinedRelay, joinedRelays } from './joinedRelays';
import { en, type Messages } from '../../i18n/app/en';
import { countedIn, listedIn } from '../../i18n/app/plain';
import type { LanguageId } from '../../i18n/app/languages';

/** The words a destination is said in: a screen hands its language's in (D-ML, L3); English when none. */
type Reasons = Messages['reasons'];
/** What is going nowhere, named in the sentence that says so. */
export type GoingNowhere = keyof Reasons['nowhere']['undecided'];
/**
 * Where each kind of publication is allowed to go, in one place.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Six paths in this codebase publish to relays. Two could be pointed somewhere
 * private; the rest were hardcoded to public infrastructure with no override,
 * including the one that publishes intel reports. That is not a rounding error
 * in a project whose own dev-relay says "littering someone else's
 * infrastructure with fixture data would be a poor way for a project about
 * contributing to a commons to test itself".
 *
 * The consequence is not only test litter. An operator learning this tool — an
 * intern, an evaluator, anyone rehearsing — cannot practise, because every
 * rehearsal is an irreversible publication. A tool that cannot be practised on
 * is a tool nobody can be trained to use safely.
 *
 * It was fixed once for mission packages, after a real test package went to
 * five public relays and could not be recalled. Then again for findings, weeks
 * later, once somebody noticed the same hole. Applying a lesson once per
 * incident instead of once per CLASS is how it came back; this module is the
 * class.
 *
 * ─── THE CONTRACT, WHICH IS THE SAME FOR EVERY CHANNEL ─────────────────────
 *
 *   VITE_NOSTR_<CHANNEL>_RELAYS            ADDS destinations to the defaults.
 *   VITE_NOSTR_<CHANNEL>_RELAYS_EXCLUSIVE  'true' REPLACES them entirely.
 *
 * Additive by default and exclusive only on request, because a developer who
 * adds a local relay has not thereby asked to stop reaching the network, and
 * silently detaching them would do less than they asked without saying so.
 */

/**
 * The default public set.
 *
 * Deliberately duplicated from nowhere: src/config/publicInfrastructure.ts
 * holds a DIFFERENT list (the measured pool, with secure chat's two extra relays,
 * nostr.oxtr.dev and nostr.bitcoiner.social since 2026-10-13), and the intel publish paths have always used this
 * one. Consolidating the two is a real question with a measurable answer —
 * which relays actually accept and serve these kinds — and guessing at it while
 * moving five call sites would change behaviour under cover of a refactor.
 */
export const DEFAULT_PUBLISH_RELAYS = NAVCOM_SURFACE_RELAYS;

/**
 * The default set to LISTEN on — The Record plus the public surface.
 *
 * Wider than DEFAULT_PUBLISH_RELAYS, and asymmetric on purpose. Listening to
 * another node's archive costs a socket and tells them nothing; publishing
 * into it puts our records in someone else's store, which is a different
 * decision and is not made here.
 *
 * This existed as FEDERATION_READ_RELAYS and was already what the globe's
 * intel ingest and FederationIngestService read from. The package path was
 * the one that still subscribed to a list of publish DESTINATIONS — so a peer
 * publishing their board to The Record was invisible here, not refused and
 * not counted, just never asked for.
 */
export const DEFAULT_READ_RELAYS = FEDERATION_READ_RELAYS;

export type PublishChannel = 'MISSION' | 'FINDING' | 'INTEL' | 'CHAT';

/**
 * Static, literal member accesses — one per channel, written out.
 *
 * NOT a computed key. `import.meta.env[\`VITE_NOSTR_${channel}_RELAYS\`]` is not
 * substituted by Vite at build time and silently yields undefined in a browser
 * bundle, which is exactly how mission-relay isolation was configured, believed
 * to be in effect, and did nothing — while a real package went to public
 * relays. The verbosity below is the fix, and it must stay verbose.
 */
const RAW: Record<PublishChannel, { relays?: unknown; exclusive?: unknown }> = (() => {
  try {
    return {
      MISSION: {
        relays: import.meta.env.VITE_NOSTR_MISSION_RELAYS,
        exclusive: import.meta.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE,
      },
      FINDING: {
        relays: import.meta.env.VITE_NOSTR_FINDING_RELAYS,
        exclusive: import.meta.env.VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE,
      },
      INTEL: {
        relays: import.meta.env.VITE_NOSTR_INTEL_RELAYS,
        exclusive: import.meta.env.VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE,
      },
      CHAT: {
        relays: import.meta.env.VITE_NOSTR_CHAT_RELAYS,
        exclusive: import.meta.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE,
      },
    };
  } catch {
    // A bare-Node context where import.meta.env is absent entirely.
    return { MISSION: {}, FINDING: {}, INTEL: {}, CHAT: {} };
  }
})();

/** process.env wins, so vitest and any CLI path can override without a rebuild. */
function readEnv(channel: PublishChannel, suffix: '' | '_EXCLUSIVE'): string | undefined {
  const key = `VITE_NOSTR_${channel}_RELAYS${suffix}`;
  try {
    if (typeof process !== 'undefined' && process?.env?.[key] !== undefined) return process.env[key];
  } catch {
    // An unreadable process.env is the same as an unset one.
  }
  const value = suffix ? RAW[channel].exclusive : RAW[channel].relays;
  return typeof value === 'string' ? value : undefined;
}

/** Where this channel's events actually go, given the build's configuration. */
export function publishRelays(channel: PublishChannel): string[] {
  return resolve(channel, DEFAULT_PUBLISH_RELAYS);
}

/**
 * Where this channel LISTENS, given the build's configuration.
 *
 * Reads the same env override as publishRelays, so isolating a channel to a
 * local relay still isolates both halves of it — a developer who points
 * missions at 127.0.0.1 means the whole channel, not just its outbound side.
 */
export function readRelays(channel: PublishChannel): string[] {
  const read = resolve(channel, DEFAULT_READ_RELAYS);
  // What a Limited mission or finding sends goes to the internal relays, and to
  // a joined team's relay its author picked (LW1), so the team reads there too
  // (plan item 0.4). Globe intel stays public.
  if (channel !== 'MISSION' && channel !== 'FINDING') return read;
  return unique([...read, ...internalRelays(), ...joinedRelays().map((r) => r.url)]);
}

/**
 * Read-only mirrors, by the relay they mirror: each read in its place only
 * when it does not answer (decision D-MX, MX27). The pool dials them.
 */
export function relayMirrors(): Readonly<Record<string, readonly string[]>> {
  return RELAY_MIRRORS;
}

/**
 * Whether this node reads that relay on the channel, written however a peer
 * wrote it: a relay a citation names may be one this node already asks
 * (D-MX, MX23), and saying it was not asked would then be false.
 */
export function readsRelay(channel: PublishChannel, url: string): boolean {
  return readRelays(channel).map(sameRelay).includes(sameRelay(url));
}

/**
 * Where a record goes, given who may receive it (plan item 0.4, decision D2):
 *
 *   public     the channel's relays
 *   limited    only relays that are not public: the team's declared internal
 *              relays, any relay of the channel's own on this network, and
 *              each joined team relay its author picked (`limitedTo`, LW1)
 *   private    nowhere: it stays in this workspace
 *   undecided  nowhere, until someone decides
 *
 * A picked relay this browser no longer belongs to is left out: joining a
 * second team never carries the first team's work to it, and leaving a team
 * stops what goes there.
 *
 * An empty list means nothing may be sent, and the screen has to say why.
 */
export function relaysFor(channel: PublishChannel, visibility: InformationVisibility | undefined, limitedTo: readonly string[] = []): string[] {
  if (visibility === 'public') return publishRelays(channel);
  if (visibility !== 'limited') return [];
  return unique([
    ...internalRelays(),
    ...publishRelays(channel).filter((r) => relayReach(r) !== 'public'),
    ...limitedTo.filter((r) => isJoinedRelay(r)),
  ]);
}

/** Each relay once, however it was written, in the order first seen. */
function unique(relays: readonly string[]): string[] {
  const seen = new Set<string>();
  return relays.filter((r) => {
    const key = sameRelay(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolve(channel: PublishChannel, defaults: readonly string[]): string[] {
  const extra = configuredRelays(channel);
  if (!extra.length) return [...defaults];
  if (keptToConfigured(channel)) return [...new Set(extra)];
  return [...new Set([...defaults, ...extra])];
}

function configuredRelays(channel: PublishChannel): string[] {
  return (readEnv(channel, '') ?? '').split(',').map((r) => r.trim()).filter(Boolean);
}

/** Exclusive, and with relays to be exclusive to: exclusive alone changes nothing. */
function keptToConfigured(channel: PublishChannel): boolean {
  return configuredRelays(channel).length > 0
    && (readEnv(channel, '_EXCLUSIVE') ?? '').toLowerCase() === 'true';
}

/**
 * Where a record goes, from who may receive it, or the words to show when
 * that is nowhere (plan items 0.4 and 0.5). `what` names the record in those
 * words: "mission", "case".
 */
export function whereItGoes(
  channel: PublishChannel,
  visibility: InformationVisibility | undefined,
  what: GoingNowhere,
  words: Reasons = en.reasons,
  limitedTo: readonly string[] = [],
): { relays: string[]; refusal: string | null } {
  const relays = relaysFor(channel, visibility, limitedTo);
  if (relays.length > 0) return { relays, refusal: null };
  switch (visibility) {
    case undefined:
      return { relays, refusal: words.nowhere.undecided[what] };
    case 'private':
      return { relays, refusal: words.nowhere.private[what] };
    case 'limited':
      return { relays, refusal: words.nowhere.limited[what] };
    default:
      return { relays, refusal: words.nowhere.none };
  }
}

/**
 * The Nostr chat provider's relays (NostrChatAdapter). It keeps its own
 * default, CHAT_PROVIDER_RELAYS, under chat's configuration, so an operator who
 * points chat at the team's relay points both chat paths there (plan item 0.3).
 */
export function chatProviderRelays(): string[] {
  return resolve('CHAT', CHAT_PROVIDER_RELAYS);
}

/**
 * The relays emergency mode adds to chat: the public relays beyond the
 * surface, for redundancy. None once chat is kept to its configured relays,
 * because an emergency is the worst time to put a team's messages on relays
 * the operator ruled out.
 */
export function emergencyChatRelays(): string[] {
  return keptToConfigured('CHAT') ? [] : [...EXTRA_PUBLIC_RELAYS];
}

/** Static member access, for the reason RAW gives above. */
const RAW_INTEL_SEARCH: unknown = (() => {
  try {
    return import.meta.env.VITE_NOSTR_INTEL_SEARCH_RELAYS;
  } catch {
    return undefined;
  }
})();

/**
 * The relays the globe asks with NIP-50 search, when search is on. Unlike
 * every channel above, configuration REPLACES the default here: it names
 * which relays can search, which is a capability, not a destination.
 */
export function intelSearchRelays(): string[] {
  let raw: unknown;
  try {
    raw = typeof process !== 'undefined' ? process?.env?.VITE_NOSTR_INTEL_SEARCH_RELAYS : undefined;
  } catch {
    raw = undefined;
  }
  if (raw === undefined) raw = RAW_INTEL_SEARCH;
  const configured = typeof raw === 'string' ? raw.split(',').map((r) => r.trim()).filter(Boolean) : [];
  return configured.length ? [...new Set(configured)] : [...NAVCOM_SURFACE_RELAYS];
}

/**
 * Where Raver Watch is read: The Record, the one place Mecha Jono publishes it
 * (globe record, section 19). Named here, as every relay set is, so that it
 * is found beside the rest; only named publishers' notes are read from it (RW2).
 */
export function raverWatchRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where Psi Watch's live notes are read from, its missions among them: The Record (D-PW). */
export function psiWatchRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where Hero Watch is read from: The Record, where Mecha Jono publishes it (D-HW). */
export function heroWatchRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where AI Watch is read from: The Record, where Mecha Jono publishes Terminator Watch (D-AW). */
export function aiWatchRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where Civil Unrest is read from: The Record, where Mecha Jono posts their protest desk (decision D-CU). */
export function civilUnrestRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where War & Conflict is read from: The Record, where Mecha Jono publishes it. */
export function warConflictRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where EIA's production figures are read from: The Record, where Mecha Jono posts them (D-DP, DP17). */
export function energyRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/** Where the Opportunity Board's OFAC and LEIE notes are read from: The Record, where Mecha Jono posts them (D-BF, BF1). */
export function boardFeedRelays(): string[] {
  return [THE_RECORD_RELAY];
}

/**
 * Where a public roster item goes (D-RS, RS14): the relays Starcom and NavCom share. The Record takes only its
 * allowlist, so a person's own item is not sent there.
 */
export function rosterRelays(): string[] {
  return [...NAVCOM_SURFACE_RELAYS];
}

/**
 * Where an RLSH card goes and is read (D-RF, RF1): the relays Starcom and NavCom share, where NavCom's cards are, so
 * one card shows on both. The Record takes only its allowlist, so a hero's card is not sent there.
 */
export function rlshCardRelays(): string[] {
  return [...NAVCOM_SURFACE_RELAYS];
}

/** Where roster items are read: those relays, and The Record, where Mecha Jono posts (D-RS, RS4). */
export function rosterReadRelays(): string[] {
  return [...new Set([THE_RECORD_RELAY, ...NAVCOM_SURFACE_RELAYS])];
}

/** Where a package signer's own profile (kind 0) is read: where its packages are (D-MF, MF4). */
export function signerProfileRelays(): string[] {
  return readRelays('MISSION');
}

/**
 * Where a person's own inbox list (kind 10050) goes: where inbox lists are read (signerProfileRelays), except The
 * Record. It takes only its allowlist, and that kind from nobody ("blocked: kind 10050 not accepted on this relay",
 * read 22 Nov 2026), so the publish review named a destination no person's list could reach.
 */
export function inboxListTargets(): string[] {
  return signerProfileRelays().filter((url) => sameRelay(url) !== sameRelay(THE_RECORD_RELAY));
}

/**
 * Reachable only from inside the operator's own network.
 *
 * Answers "private" only when it can PROVE it: an unparseable or unrecognised
 * URL is public. The honest failure is to over-warn — wrongly saying "public"
 * costs a second thought, wrongly saying "private" costs an irretrievable
 * publish somebody believed was a sandbox exercise.
 */
export function isPrivateRelayUrl(url: string): boolean {
  let host: string;
  try {
    // Brackets stripped: URL().hostname returns "[::1]" for ws://[::1]:7447,
    // so comparing against "::1" silently reports IPv6 loopback as PUBLIC —
    // the direction of error that costs an irretrievable publish.
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '127.0.0.1' || host === '::1' || host.startsWith('127.')) return true;
  if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/**
 * The operator's internal relays: access-controlled, reached through the
 * tunnel (plan item 0.3). Declared, never inferred: a relay nobody declared is
 * public, because calling a public relay private is the direction of error
 * that costs a publish nobody can take back. Kept out of every published relay
 * list, so no descriptor names them.
 *
 * Static member access, for the reason RAW gives above.
 */
const RAW_INTERNAL: unknown = (() => {
  try {
    return import.meta.env.VITE_NOSTR_INTERNAL_RELAYS;
  } catch {
    return undefined;
  }
})();

/** A relay URL compared the way a person means it: case and trailing slash ignored. */
const sameRelay = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();

export function internalRelays(): string[] {
  let raw: unknown;
  try {
    raw = typeof process !== 'undefined' ? process?.env?.VITE_NOSTR_INTERNAL_RELAYS : undefined;
  } catch {
    raw = undefined;
  }
  if (raw === undefined) raw = RAW_INTERNAL;
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map((r) => r.trim()).filter(Boolean))];
}

/**
 * The relays this person signs in to (NIP-42). A sign-in tells a relay who is
 * reading, so it goes only where the person belongs, never to any relay that
 * asks: the build's internal set, Archangel Agency's default, and each team
 * relay the person has joined (plan item 2.3).
 */
export function hasJoined(url: string): boolean {
  return internalRelays().map(sameRelay).includes(sameRelay(url)) || isJoinedRelay(url);
}

/**
 * How far a relay reaches, in the three words the app uses everywhere:
 *
 *   public    anyone can read it, and nothing can recall it
 *   internal  a relay with access control, reached through the tunnel
 *   local     this network only
 */
export type RelayReach = 'public' | 'internal' | 'local';

export function relayReach(url: string): RelayReach {
  if (isPrivateRelayUrl(url)) return 'local';
  const declared = internalRelays().map(sameRelay);
  // A team relay the person joined has access control too (plan item 2.3).
  return declared.includes(sameRelay(url)) || isJoinedRelay(url) ? 'internal' : 'public';
}

/** The widest reach among several relays: what publishing to all of them amounts to. */
export function widestReach(relays: readonly string[]): RelayReach {
  const reaches = relays.map(relayReach);
  if (reaches.includes('public')) return 'public';
  if (reaches.includes('internal')) return 'internal';
  return 'local';
}

/** One relay's reach, as a person reads it beside its address. */
export const REACH_WORDS: Record<RelayReach, string> = en.missions.relayReach;

/**
 * Where a Mission Package goes, in a few words, beneath the button that
 * publishes it (plan item 3.7, decision D8): Navcom named beside the relays
 * it means, counted by their reach.
 */
export function destinationLine(relays: readonly string[], lang: LanguageId = 'en', words: Messages['missions'] = en.missions): string {
  const counts = new Map<RelayReach, number>();
  for (const relay of relays) counts.set(relayReach(relay), (counts.get(relayReach(relay)) ?? 0) + 1);
  const kinds = (['public', 'internal', 'local'] as const).filter((reach) => counts.has(reach));
  if (kinds.length === 1) return countedIn(lang, words.destinationOnly[kinds[0]], relays.length);
  const parts = kinds.map((reach) => countedIn(lang, words.destinationPart[reach], counts.get(reach) ?? 0));
  return countedIn(lang, words.destinationMixed, relays.length, { parts: listedIn(lang, parts) });
}

/** True when ANY destination is public — one public relay makes the act irreversible. */
export function destinationIsPublic(relays: readonly string[]): boolean {
  return relays.some((r) => relayReach(r) === 'public');
}

/**
 * The sentence an operator reads before an irreversible act.
 *
 * A list of relay URLs is not something a newcomer can read for safety, so the
 * consequence is stated in words and the addresses come second. "Nothing leaves
 * your network" is said only of relays on this network, never of a relay
 * reached through a tunnel.
 */
export function describeDestination(relays: readonly string[], words: Reasons = en.reasons): string {
  switch (widestReach(relays)) {
    case 'public':
      return words.destination.public;
    case 'internal':
      return words.destination.internal;
    default:
      return words.destination.private;
  }
}
