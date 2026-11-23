/**
 * Navcom kind-1911 field observations → Starcom Observations.
 *
 * The contract is `navcom-intel/0.1.0`, agreed across two exchanged documents
 * rather than assumed. Navcom's five adapter obligations drive almost every
 * decision in this file, and the ones that are not obvious are marked.
 *
 * ─── THE WIRE FORMAT, AS NAVCOM PUBLISHES IT ───────────────────────────────
 *
 * Read from NavCom's contract (`/.well-known/navcom-intel.json`, 0.1.0) and its
 * builder (packages/core/src/directory/observation.ts) on 2026-10-06, when this
 * file was rewritten: it had been built against an earlier draft with a `spec`
 * tag, vocabulary in `t` tags, the method in `m`, the anchor in `a` and a
 * geohash in `g`, and would have dropped every real observation.
 *
 *   tags     ["g", <the anchor's region slug>]  NEVER a geohash: "a few slugs
 *                                                happen to parse as one; decode
 *                                                none of them"
 *            ["d", <the anchor id>]             the same as content.anchor
 *            ["refines", <event id>]            only on the exact release
 *   content  { anchor, observed_at (unix seconds), tags (bare vocabulary
 *              members, 1 to 8), method, callsign, precision,
 *              area (4-character geohash) | lat, lon, supersedes? }
 *
 * No tag carries a position. The events carry no version: what is checked is
 * that every field matches this shape, and nothing else is accepted.
 *
 * ─── THE RULE THIS FILE IS BUILT AROUND ────────────────────────────────────
 *
 * Anyone can publish kind 1911. There is no registry and no server that could
 * operate one, by design. So a valid event proves that SOMEBODY signed it and
 * nothing else — not that it came from the Navcom app, not that anyone
 * reviewed it, not that Navcom endorses it. Navcom has no mechanism to disown
 * a hostile event and none to have blessed a good one.
 *
 * Two consequences, both load-bearing:
 *
 *   1. This adapter validates independently and repairs nothing.
 *   2. Nothing derived from these events may be labelled "from Navcom".
 *      "Conforms to navcom-intel/0.1.0" is the true statement. That is a
 *      rendering rule as much as a data one, because a marker on a globe is
 *      exactly where the distinction gets lost.
 *
 * ─── WHY sourceId IS 'navcom' AND upstreamSourceId IS THE PUBKEY ───────────
 *
 * Independence is counted in correlationUtils as the set of distinct
 * `feedId ?? sourceId`, where `feedId` is `upstreamSourceId ?? sourceId`.
 *
 * Navcom found a defect neither side had caught: its two-stage publication
 * emits a coarse event now and a precise one 48 hours later, as two separate
 * events with different ids. Dedupe-on-event-id cannot catch that, and left
 * alone the pair would CORROBORATE — one operator reporting one thing once,
 * manufacturing its own confirmation.
 *
 * Putting the operator's pubkey in `upstreamSourceId` resolves it using the
 * mechanism exactly as documented there: "a relayed claim and the original
 * land in the SAME feed and cannot corroborate each other". Two events from
 * one operator share a feed. Two operators do not. Navcom carried the
 * observation; the operator observed it, which is what `feedId` means.
 *
 * It also keeps the adapter contract intact — every observation still carries
 * this adapter's own `source.id`, which adapterContract asserts.
 */
import { nip19 } from 'nostr-tools';
import type { Observation, Source, FieldMethod } from '../../../../types/intel/SourceObservation';
import { OBSERVATION_SCHEMA_VERSION, FIELD_METHODS } from '../../../../types/intel/SourceObservation';
import type { SourceAdapter, AdapterResult } from './types';
import { decodeGeohash } from './geohash';

/** The contract version this adapter conforms to. The events carry none; NavCom's contract states it. */
export const NAVCOM_SPEC_VERSION = 'navcom-intel/0.1.0';

/** The kind Navcom publishes field observations as. */
export const NAVCOM_OBSERVATION_KIND = 1911;

/**
 * Geohash lengths accepted, as a set rather than a minimum.
 *
 * Navcom is pinning its cell to 4 characters. Its draft labelled the cell
 * "COARSE (~20km)" while its worked example used 5 characters (±2.4km) — an
 * eight-fold disagreement in the field whose only job is preventing an
 * operator from being located, which they caught and are fixing.
 *
 * A LONGER hash is rejected rather than accepted-as-better: an over-precise
 * AREA event has escaped the policy protecting the person who filed it, and is
 * not something to ingest because it looks more useful.
 *
 * It is NOT the refinement detector, which is what I first assumed. Navcom's
 * precision table is `area = 4-char geohash` and `exact = full coordinates`, so
 * the precise release arrives in a different FIELD rather than as a longer
 * hash — this check would never have fired on the real thing. `precision` is
 * the reliable signal until the replace-not-add tag lands.
 */
export const ACCEPTED_GEOHASH_LENGTHS = new Set([4]);

export const NAVCOM_SOURCE: Source = {
  id: 'navcom',
  kind: 'field-report',
  label: 'Navcom field observations (kind 1911)',
  /**
   * F — "reliability cannot be judged" — and it is the honest grade rather
   * than a pessimistic one. There is no registry, so a first-seen key has no
   * history to judge. F is not a slur on field operators; it is the accurate
   * statement that Starcom cannot tell one from an impostor.
   *
   * The consequence is intended and worth stating plainly, because it decides
   * what this integration is FOR. Weight is trust x method x decay, so a fresh
   * first-person sighting weighs 0.1 x 0.85 = 0.085, and computeReportConfidence
   * takes the best source's weight plus a corroboration bonus capped at 0.15.
   * Navcom observations therefore do not become credible on their own however
   * many arrive — which also means a Sybil with a thousand keys buys 0.15.
   *
   * What they do is corroborate and localise sources that are graded better,
   * and raise attention. That is the division of labour the ecosystem document
   * already describes: Navcom looks forward and near, Starcom analyses.
   */
  trustBaseline: 'F',
  ingestMethod: 'subscribe',
  // Every sourceRecordId here is a Nostr event id, so a third party can fetch
  // the original from any relay carrying it. This is what makes a citation in
  // a Finding walkable rather than decorative.
  recordIdScheme: 'nostr-event',
  isMock: false,
};

/** A Nostr event, narrowed to what this adapter reads. */
export interface NavcomRawEvent {
  id?: unknown;
  kind?: unknown;
  pubkey?: unknown;
  created_at?: unknown;
  content?: unknown;
  tags?: unknown;
  sig?: unknown;
}

/** The vocabulary as the adapter reads it: its members, the namespace each is grouped under, and NavCom's word for the list. */
export interface NavcomVocabularyView {
  tags: ReadonlySet<string>;
  namespaceOf?: ReadonlyMap<string, string>;
  status: string;
}

export interface NavcomAdapterOptions {
  /**
   * The closed vocabulary, read at validation time — never pinned.
   *
   * A FUNCTION rather than a set, because the list is fetched from Navcom's
   * `/.well-known/navcom-intel.json` and refreshed on a cadence, while
   * `toObservations` is synchronous. See NavcomVocabularySource, whose
   * `current` accessor is what belongs here.
   *
   * Navcom asked explicitly that the members not be pinned or vendored: the
   * published list is a stub awaiting local knowledge and WILL change, and a
   * stale copy would reject the real vocabulary the day it lands — dropping
   * valid observations in the exact shape of malformed input.
   *
   * Returning null means membership was NOT checked, only the shape: NavCom's
   * own rule for a list it cannot confirm is current. It is deliberately
   * distinct from an empty set, which would reject everything.
   */
  vocabulary?: () => NavcomVocabularyView | null | undefined;
  /**
   * Verifies the event signature. Injected so this file does not depend on a
   * particular Nostr library, and so the check is asserted rather than
   * inherited: a verification you did not write is one that can be configured
   * away without anyone noticing.
   */
  verifySignature: (event: NavcomRawEvent) => boolean;
}

/** A vocabulary member as NavCom writes it on the wire: bare, lower case, words joined by underscores. */
const MEMBER = /^[a-z][a-z0-9_]*$/;
/** NavCom's limit on tags per observation. */
const TAGS_MAX = 8;
/** A Nostr event id. */
const EVENT_ID = /^[0-9a-f]{64}$/;
/** A callsign, or `anonymous`: bounded, so it cannot become a field for prose. */
const CALLSIGN_MAX = 64;

/**
 * An operator as a person reads them: the callsign they gave, then their key,
 * short. The key is there because many give `anonymous`, and two operators
 * read as one name would look like one person corroborating themselves.
 */
export function operatorLabel(callsign: string, pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${callsign} · ${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return callsign;
  }
}

/**
 * The methods kind 1911 may carry. Anything else is not an observation.
 *
 * Imported rather than restated: a collection requirement names the same list
 * when it says what field work would answer it, and a local copy here is how
 * the ask and the answer drift apart.
 */
const ACCEPTED_METHODS: ReadonlySet<string> = new Set(FIELD_METHODS);

/**
 * Content fields this contract defines. Anything else is refused, as NavCom's
 * own reader refuses it: "refused, not trimmed". The field somebody eventually
 * tries to add is a description of a person, and a reader that ignored what it
 * did not recognise would pass it through to a screen.
 */
const ALLOWED_CONTENT_KEYS = new Set([
  'anchor', 'observed_at', 'tags', 'method', 'callsign', 'precision', 'supersedes', 'area', 'lat', 'lon',
]);

function tagValues(tags: unknown, name: string): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is unknown[] => Array.isArray(t) && t[0] === name)
    .map((t) => (typeof t[1] === 'string' ? t[1] : ''))
    .filter((v) => v.length > 0);
}

export class NavcomAdapter implements SourceAdapter<NavcomRawEvent> {
  readonly source = NAVCOM_SOURCE;

  constructor(private readonly options: NavcomAdapterOptions) {}

  toObservations(raw: NavcomRawEvent[]): AdapterResult {
    const observations: Observation[] = [];
    const dropped: Array<{ nativeId?: string; reason: string }> = [];
    /** Each author's own superseded accounts: author → event id → the event that superseded it. */
    const superseded = new Map<string, Map<string, string>>();

    for (const event of raw) {
      const nativeId = typeof event?.id === 'string' ? event.id : undefined;
      const drop = (reason: string) => dropped.push({ nativeId, reason });

      /*
       * A record that is not an object at all. Caught by the shared adapter
       * contract, which feeds every adapter a null to check it rejects rather
       * than coerces — and it caught this file dereferencing before checking.
       */
      if (event === null || typeof event !== 'object' || Array.isArray(event)) {
        drop('record is not an object');
        continue;
      }

      // ── Obligation 2: the signature, before anything else ────────────────
      if (!this.options.verifySignature(event)) {
        drop('signature did not verify');
        continue;
      }

      /*
       * A valid signed event always has a pubkey, so reaching this branch
       * means verification did not gate the path. A loud, distinct rejection
       * rather than a throw: this runs per event in a batch, and one malformed
       * record must not take down the rest of the pull.
       */
      if (typeof event.pubkey !== 'string' || event.pubkey.length === 0) {
        drop('PROGRAMMING ERROR: verified event has no pubkey — the signature gate did not run');
        continue;
      }
      if (typeof nativeId !== 'string') {
        drop('PROGRAMMING ERROR: verified event has no id — the signature gate did not run');
        continue;
      }

      if (event.kind !== NAVCOM_OBSERVATION_KIND) {
        drop(`kind ${String(event.kind)} is not ${NAVCOM_OBSERVATION_KIND}`);
        continue;
      }

      /*
       * The 48-hour refinement, set aside. NavCom's rule is that the exact
       * release replaces the coarse one's position and the two never
       * corroborate. Until a pair is read as one, the coarse event stands
       * alone: coarse and correct beats precise and doubled. NavCom has not
       * emitted one yet (its contract: `refinement_not_emitted`).
       */
      if (tagValues(event.tags, 'refines').length > 0) {
        drop('refinement event: set aside until a pair can be read as one observation');
        continue;
      }

      // ── Content: parsed, never repaired ──────────────────────────────────
      let content: Record<string, unknown>;
      try {
        const parsed = typeof event.content === 'string' ? JSON.parse(event.content) : null;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          drop('content is not a JSON object');
          continue;
        }
        content = parsed as Record<string, unknown>;
      } catch {
        drop('content is not valid JSON');
        continue;
      }

      const unexpected = Object.keys(content).filter((k) => !ALLOWED_CONTENT_KEYS.has(k));
      if (unexpected.length > 0) {
        // Obligation 1. An unbounded field is the thing the format exists to
        // refuse; accepting one here would reopen it on our side.
        drop(`content carries fields outside the contract: ${unexpected.join(', ')}`);
        continue;
      }

      const anchor = typeof content.anchor === 'string' ? content.anchor.trim() : '';
      if (!anchor) {
        drop('content names no anchor');
        continue;
      }
      // The tags say only what the content says (NavCom's section 4): d is the anchor.
      const anchorTags = tagValues(event.tags, 'd');
      if (anchorTags.length === 0) {
        drop('no d (anchor) tag');
        continue;
      }
      if (anchorTags.length > 1 || anchorTags[0] !== anchor) {
        drop(`d tag "${anchorTags.join(', ')}" is not the anchor the content names`);
        continue;
      }

      /*
       * `observed_at`, never `created_at`, in unix seconds as NavCom writes it.
       * created_at is publication time, and weight decays with the age of the
       * OBSERVATION: the publication stamp would make a 48-hour-old sighting
       * look fresh, and a backfill look like a flood of new intelligence.
       */
      const observedAt = content.observed_at;
      if (typeof observedAt !== 'number' || !Number.isFinite(observedAt) || observedAt <= 0) {
        drop('observed_at is absent or not unix seconds');
        continue;
      }
      const timestamp = new Date(Math.floor(observedAt) * 1000).toISOString();

      const method = content.method;
      if (typeof method !== 'string' || !ACCEPTED_METHODS.has(method)) {
        drop(`method ${String(method)} is not one of ${FIELD_METHODS.join(', ')}`);
        continue;
      }

      if (typeof content.callsign !== 'string' || content.callsign.trim().length === 0 || content.callsign.length > CALLSIGN_MAX) {
        drop('callsign is absent, or longer than a callsign is');
        continue;
      }

      if (content.supersedes !== undefined && (typeof content.supersedes !== 'string' || !EVENT_ID.test(content.supersedes))) {
        drop('supersedes is not an event id');
        continue;
      }

      /*
       * Precision is what distinguishes the two stages. An area is a geohash
       * of exactly four characters (±20 km) in the CONTENT; an exact release
       * carries coordinates instead, and is set aside like a refinement.
       */
      const precision = content.precision;
      if (precision === 'exact') {
        drop('precision "exact": the refined release, set aside until a pair can be read as one');
        continue;
      }
      if (precision !== 'area') {
        drop(`precision "${String(precision)}" is not one of area, exact`);
        continue;
      }
      if (typeof content.area !== 'string') {
        drop('an area observation names no area');
        continue;
      }
      const cell = decodeGeohash(content.area);
      if (!cell) {
        drop(`area "${content.area}" is not a geohash`);
        continue;
      }
      if (!ACCEPTED_GEOHASH_LENGTHS.has(cell.precisionChars)) {
        drop(
          `area is ${cell.precisionChars} characters; an area is ${[...ACCEPTED_GEOHASH_LENGTHS].join(', ')} characters `
          + '— a finer one has escaped the policy that protects the operator',
        );
        continue;
      }

      const members = Array.isArray(content.tags) ? content.tags : null;
      if (!members || members.length === 0) {
        drop('no tags: an observation that asserts nothing is not one');
        continue;
      }
      if (members.length > TAGS_MAX || !members.every((t) => typeof t === 'string' && MEMBER.test(t))) {
        drop(`tags are not vocabulary members in shape (one to ${TAGS_MAX}, lower case): ${members.join(', ')}`);
        continue;
      }
      const vocabulary = this.options.vocabulary?.();
      if (vocabulary) {
        const unknown = (members as string[]).filter((t) => !vocabulary.tags.has(t));
        if (unknown.length > 0) {
          /*
           * The status travels with the rejection on purpose. Navcom publishes
           * "stub — needs local knowledge" alongside the list, and a valid tag
           * dropped against a stale or placeholder list is otherwise
           * indistinguishable from a malformed one at the drop site.
           */
          drop(`vocabulary tags not in the fetched list: ${unknown.join(', ')} (list status: ${vocabulary.status})`);
          continue;
        }
      }

      if (typeof content.supersedes === 'string') {
        const own = superseded.get(event.pubkey) ?? new Map<string, string>();
        own.set(content.supersedes, nativeId);
        superseded.set(event.pubkey, own);
      }

      /*
       * One observation per tag. Starcom's corroboration works per (subject,
       * attribute) claim, so an event asserting two things about one anchor
       * becomes two claims, each corroborated or contradicted on its own.
       *
       * The attribute is the member's namespace, so two members of one
       * namespace about one anchor can contradict. Without the vocabulary the namespace
       * is unknown, and the member stands as its own attribute: two different
       * members then never read as a contradiction they might not be.
       *
       * `sourceRecordId` keeps the retrievable event id on every one of them,
       * which is obligation 5 — a third party walks the derivation back by
       * fetching that id from any relay carrying it.
       */
      for (const member of members as string[]) {
        const namespace = vocabulary?.namespaceOf?.get(member);
        const claim = namespace ? { attribute: namespace, value: member } : { attribute: member, value: 'observed' };
        observations.push({
          id: `${nativeId}#${member}`,
          sourceId: NAVCOM_SOURCE.id,
          upstreamSourceId: event.pubkey,
          // For reading only, never published: a Finding names no source.
          upstreamSourceLabel: operatorLabel((content.callsign as string).trim(), event.pubkey),
          sourceRecordId: nativeId,
          subjectEntityRef: anchor,
          claim,
          timestamp,
          method: method as FieldMethod,
          geo: { lat: cell.lat, lon: cell.lon },
          geoPrecisionM: cell.radiusM,
          label: namespace ? `${namespace}: ${member}` : member,
          tags: [...(members as string[])],
          subjectKind: 'place',
          isMock: false,
          schemaVersion: OBSERVATION_SCHEMA_VERSION,
        });
      }
    }

    /*
     * An author's later account replaces their earlier one (`supersedes`),
     * never anyone else's: supersession is scoped to the author's own account.
     */
    const kept = observations.filter((obs) => {
      const by = superseded.get(obs.upstreamSourceId ?? '')?.get(obs.sourceRecordId ?? '');
      return by === undefined;
    });
    for (const [, own] of superseded) {
      for (const [old, by] of own) {
        if (observations.some((o) => o.sourceRecordId === old && kept.every((k) => k.sourceRecordId !== old))) {
          dropped.push({ nativeId: old, reason: `superseded by its author in ${by}` });
        }
      }
    }

    return { observations: kept, dropped };
  }
}

/**
 * Build the adapter. A verifier must be supplied — there is no default, because
 * a default is how a verification step becomes optional.
 */
export function createNavcomAdapter(options: NavcomAdapterOptions): NavcomAdapter {
  return new NavcomAdapter(options);
}
