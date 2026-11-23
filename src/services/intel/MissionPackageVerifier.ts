/**
 * Verify a Mission Package received from the network.
 *
 * Starcom was publish-only on the dispatch track. Nothing consumed kind
 * 30079, and `verifyManifestSignature` — real, tested, correct — had no
 * caller outside its own test file. So the conformance checklist handed to a
 * second node ("a package you publish verifies in Starcom, and one Starcom
 * publishes verifies in yours") was half impossible on our side.
 *
 * This is deliberately a VERIFIER, not an importer. Deciding what a foreign
 * mission means in this workspace — whether it becomes a record, who it is
 * attributed to, what it may corroborate — is a trust question with its own
 * answer, and answering it silently by writing to storage would be the wrong
 * kind of helpful. Verification is the part the specification defines; the
 * rest is a product decision that deserves to be made explicitly.
 *
 * Two signatures cover a package and neither replaces the other:
 *
 *   - the outer Nostr Schnorr signature, proving the event came from the
 *     pubkey it claims and was not altered in transit;
 *   - the inner ML-DSA-65 block over the canonical manifest digest, proving
 *     the manifest payload specifically is what its producer signed,
 *     independent of any relay's handling of the outer event.
 *
 * A package failing either is not a package this node will act on.
 */
import { nip19, verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { MISSION_PACKAGE_KIND } from './MissionPackageBroadcastService';
import { verifyManifestSignature } from '../exchange/signing';
import { validateManifest } from '../exchange/schema';
import type { PackageManifest } from '../exchange/types';
import { profileTags } from './packageProfile';
import { formatCount } from '../../utils/formatCount';
import { missionNamesPeopleProblem, missionWords } from './missionNamesPeople';

/**
 * Why a package was refused, as a stable identifier.
 *
 * Same contract rule as the capability codes: add freely, never rename. A
 * peer's tests assert these.
 */
export type PackageRefusal =
  | 'publisher-not-admitted'
  | 'wrong-kind'
  | 'bad-event-signature'
  | 'missing-app-tag'
  | 'missing-identifier'
  | 'unparseable-content'
  | 'malformed-manifest'
  | 'author-missing'
  | 'author-not-signer'
  | 'report-body-crossed'
  | 'missing-manifest-signature'
  | 'bad-manifest-signature'
  | 'profile-tags-disagree'
  | 'field-package-unreportable'
  | 'content-too-large'
  | 'list-too-long'
  /** Its text carries the words of a note tagged names_people: a mission names no one (D-NP, NP5). */
  | 'carries-named-words';

export interface PackageCheck {
  ok: boolean;
  code?: PackageRefusal;
  /** Operator-facing. May be reworded; `code` may not. */
  reason?: string;
  /** Present only when the package verified. */
  manifest?: PackageManifest;
}

/**
 * Which publishing nodes this receiver will admit.
 *
 * THIS is the inter-node trust decision, and it is deliberately the only one.
 * A peer's capability chain answers who among THEIR operators may dispatch —
 * an internal question we cannot verify and should not try to: the chain would
 * have to carry their operators' pubkeys, and its root is an identity their
 * boundary forbids sending. See missionCapability.ts.
 *
 * What a receiver can decide is whether it accepts this NODE at all, from the
 * outer event's pubkey, which legitimately crosses.
 *
 * `undefined` admits everyone, and that is the honest default for an open
 * intelligence commons: a package from an unknown node is not thereby false,
 * and refusing to look is not the same as refusing to believe. A deployment
 * that needs a tighter perimeter sets an allowlist; the publisher is surfaced
 * either way, so "who sent this" is never a mystery.
 */
export interface AdmissionPolicy {
  admittedPublishers?: ReadonlySet<string>;
}

const refuse = (code: PackageRefusal, reason: string): PackageCheck => ({ ok: false, code, reason });

/**
 * Rebuild from canonical fields before verifying.
 *
 * nostr-tools caches a verification result on a symbol property that survives
 * object spread, so a mutated copy can verify without the hash being
 * recomputed. Wire events are JSON-parsed and cannot carry it, but this
 * function is also called on locally-constructed events in tests and in the
 * publish round-trip, where they can. The spec makes this mandatory.
 */
const canonicalEvent = (e: NostrEvent): NostrEvent => ({
  id: e.id, pubkey: e.pubkey, created_at: e.created_at,
  kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
} as NostrEvent);

/** The key an author names, as lowercase hex, when it names one (hex or npub); null for a callsign. */
function keyNamedBy(author: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(author)) return author.toLowerCase();
  if (/^npub1[0-9a-z]+$/i.test(author)) {
    try {
      const decoded = nip19.decode(author.toLowerCase());
      // An npub that does not decode names no key we can hold it to: treated as a callsign would be wrong, so as nobody's.
      return decoded.type === 'npub' ? decoded.data : 'undecodable';
    } catch {
      return 'undecodable';
    }
  }
  return null;
}

const tagValues = (event: NostrEvent, name: string): string[] =>
  event.tags.filter((t) => t[0] === name).map((t) => t[1]);

/** The tags a profile is written as, beside NavCom's `t`: each must say what the signed profile says. */
const PROFILE_TAGS = ['mission_state', 'claims', 'valid_until', 'jurisdiction', 'agent'] as const;

/** Whether the event's profile tags say exactly what its manifest's signed profile says. */
function tagsSayProfile(event: NostrEvent, profile: NonNullable<PackageManifest['profile']>): boolean {
  const expected = profileTags(profile);
  const said = (name: string, tags: string[][]) => JSON.stringify(tags.filter((t) => t[0] === name).map((t) => t[1]).sort());
  return PROFILE_TAGS.every((name) => said(name, event.tags) === said(name, expected))
    && tagValues(event, 't').includes('navcom_mission') === expected.some((t) => t[0] === 't' && t[1] === 'navcom_mission');
}

/*
 * A package is anyone's to post, and two of the relays read take 1 MB events. The schema check keeps an issue for
 * every failing list entry, and zod's own `.max()` still walks them all, so 1 MB of `{}` cost a reader about 250 MB.
 * Both limits are counted before parsing (security re-audit, 2026-10-23).
 */
/** The Record's own message limit (NIP-11): nothing Starcom's relay can carry is refused. The largest real package was 37,742 bytes. */
const CONTENT_MAX_BYTES = 131_072;
/** Entries one manifest list may hold. Real lists held at most 1. */
const LIST_MAX = 1_000;
const LISTS = ['reports', 'intel', 'assets'] as const;

export async function verifyMissionPackageEvent(
  event: NostrEvent,
  policy: AdmissionPolicy = {},
  /**
   * The family's tag a package must carry: `starcom_mission_package`, or another family's on the same envelope, as
   * Psi Watch's missions carry `psi_mission_package` and never the other (decision D-PW, PW91; their kit's question 1).
   * Every other check is the same.
   */
  options: { appTag?: string } = {},
): Promise<PackageCheck> {
  const appTag = options.appTag ?? 'starcom_mission_package';
  if (policy.admittedPublishers && !policy.admittedPublishers.has(event.pubkey)) {
    return refuse('publisher-not-admitted',
      `This receiver does not admit packages from ${event.pubkey.slice(0, 12)}…`);
  }
  if (event.kind !== MISSION_PACKAGE_KIND) {
    return refuse('wrong-kind', `Not a Mission Package: kind ${event.kind}.`);
  }
  if (!verifyEvent(canonicalEvent(event))) {
    return refuse('bad-event-signature', 'The event signature does not verify against its contents.');
  }
  if (!tagValues(event, 't').includes(appTag)) {
    return refuse('missing-app-tag', `The event does not carry the ${appTag} tag.`);
  }
  if (tagValues(event, 'd').length === 0) {
    return refuse('missing-identifier', 'The event has no d tag, so it addresses no replaceable slot.');
  }

  // UTF-8 is never shorter than the string, so only a string within the limit is encoded to be measured.
  if (event.content.length > CONTENT_MAX_BYTES || new TextEncoder().encode(event.content).length > CONTENT_MAX_BYTES) {
    return refuse('content-too-large', `The package is over ${formatCount(CONTENT_MAX_BYTES)} bytes, more than a reader takes.`);
  }

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(event.content) as PackageManifest;
  } catch {
    return refuse('unparseable-content', 'The event content is not JSON.');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.reports)) {
    return refuse('malformed-manifest', 'The content is not a Mission Package manifest.');
  }
  const longList = LISTS.find((list) => Array.isArray(manifest[list]) && manifest[list].length > LIST_MAX);
  if (longList) {
    return refuse('list-too-long', `The manifest's ${longList} list holds ${formatCount(manifest[longList].length)} entries, more than the ${formatCount(LIST_MAX)} a reader takes.`);
  }

  /*
   * The author is the signer (D-MX, MX7, interchange rev 11): their callsign,
   * or their key. A callsign cannot be checked; a key can, and a key naming
   * anyone but the signer would publish in another's name. Before rev 11 an
   * author naming a key was refused outright, as the author was the publishing
   * node: packages from then name a node, and are still accepted.
   */
  const author = typeof manifest.author === 'string' ? manifest.author.trim() : '';
  if (!author) return refuse('author-missing', 'The manifest names no author.');
  const authorKey = keyNamedBy(author);
  if (authorKey !== null && authorKey !== event.pubkey.toLowerCase()) {
    return refuse('author-not-signer',
      'The manifest names another key as its author. The author is whoever signs it.');
  }

  // The boundary the sender was supposed to enforce, checked by the receiver
  // too: a report entry carrying body content means linked content crossed.
  if (manifest.reports.some((r) => r && typeof r === 'object' && 'content' in r)) {
    return refuse('report-body-crossed',
      'A report entry carries body content, which must never cross the boundary.');
  }

  // The package manifest schema, checked in full. validateManifest was written for this
  // and called by nothing, so a package only had to be JSON with a `reports` array, an
  // author and a signature block to reach the signature check. It runs after the checks
  // above, which name a specific problem, and before the signature, the costly one.
  const shape = validateManifest(manifest);
  if (shape.valid === false) {
    const shown = shape.errors.slice(0, 3).join('; ');
    const more = shape.errors.length > 3 ? ` (and ${shape.errors.length - 3} more)` : '';
    return refuse('malformed-manifest', `The manifest does not match the package manifest schema: ${shown}${more}.`);
  }

  /*
   * The profile NavCom reads is the event's tags; the manifest signs the same
   * values (rev 11). A package whose tags say otherwise than what it signed is
   * refused, so nobody reads one thing and verifies another. A package with
   * no signed profile, from before rev 11 or from another producer, has its
   * tags read as they are.
   */
  if (manifest.profile && !tagsSayProfile(event, manifest.profile)) {
    return refuse('profile-tags-disagree',
      'The event\'s tags say other than the profile its manifest signs: its state, who takes it, its region, its end or its agent.');
  }

  const signature = (manifest.metadata as { signature?: unknown } | undefined)?.signature;
  if (!signature) {
    return refuse('missing-manifest-signature', 'The manifest carries no ML-DSA signature block.');
  }
  if (!(await verifyManifestSignature(manifest))) {
    return refuse('bad-manifest-signature',
      'The manifest signature does not verify against its canonical digest.');
  }

  const unreportable = fieldPackageProblem(event, manifest);
  if (unreportable) return refuse('field-package-unreportable', unreportable);

  const naming = missionNamesPeopleProblem(missionWords(manifest));
  if (naming) return refuse('carries-named-words', naming);

  return { ok: true, manifest };
}

/** 2100-01-01T00:00:00Z: NavCom refuses a field package that says it runs past it. */
const YEAR_2100 = 4_102_444_800;
const EFFECT_MAX = 200;

/**
 * Why a field package could be taken on but never reported, or null (NavCom's mission interchange rev 5, §4.3;
 * adopted, D-MX MX28): no objectives; two sharing an id; an id, or the `d` tag, empty or with whitespace; an
 * effect line over 200 characters; or a `valid_until` past 2100. Desk packages are not held to it. A repeated or
 * blank effect line is not a refusal: it is read once, or not at all.
 */
function fieldPackageProblem(event: { tags: string[][] }, manifest: PackageManifest): string | null {
  if (!event.tags.some((t) => t[0] === 't' && t[1] === 'navcom_mission')) return null;
  const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  if (!d || /\s/.test(d)) return 'A field package whose d tag is empty or holds a space cannot be reported on.';
  const objectives = manifest.objectives ?? [];
  if (objectives.length === 0) return 'A field package with no objectives can be taken on but never reported: it names nothing to report.';
  const ids = objectives.map((o) => o.id ?? '');
  if (ids.some((id) => !id || /\s/.test(id))) return 'A field package has an objective whose id is empty or holds a space, so no report can name it.';
  if (new Set(ids).size !== ids.length) return 'A field package has two objectives sharing an id, so a report could not say which it answers.';
  const format = (manifest.metadata as { mechaJono?: { format?: { effect?: unknown } } } | undefined)?.mechaJono?.format;
  const effect = Array.isArray(format?.effect) ? format.effect.filter((e): e is string => typeof e === 'string') : [];
  if (effect.some((line) => line.length > EFFECT_MAX)) return `A field package has an effect line over ${EFFECT_MAX} characters, longer than a report can carry.`;
  const until = Number(event.tags.find((t) => t[0] === 'valid_until')?.[1]);
  if (Number.isFinite(until) && until > YEAR_2100) return 'A field package says it runs past 2100, which no report can settle.';
  return null;
}
