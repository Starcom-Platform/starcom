/**
 * Generates the CONSUMER-side conformance vectors: kind 1911 in, verdict out.
 *
 * ─── WHY THIS DIRECTION NEEDED ITS OWN SET ─────────────────────────────────
 *
 * Every vector this project published until now describes what Starcom EMITS —
 * an attested claim, a refutation, a mission package — so a peer can check that
 * what they receive from us is what the spec said. Navcom is building the other
 * direction: boots-on-the-ground observations flowing INTO Starcom, where we
 * are the consumer and they are the producer.
 *
 * They had a written contract and no way to test against it. `navcomAdapter`
 * makes about twenty distinct accept/reject decisions, several of them
 * non-obvious from prose — an event with two vocabulary tags becomes TWO
 * observations, a `notes` field is refused outright, a 6-character geohash is
 * refused even though it is more precise. A producer discovers those by having
 * events silently dropped, which is the worst possible way to learn them.
 *
 * ─── WHAT IS NORMATIVE HERE, AND WHAT IS NOT ───────────────────────────────
 *
 * `expect.observations` is the contract: how many observations a conforming
 * consumer derives. Zero means the event is refused.
 *
 * `diagnostic.reasonContains` is NOT a conformance requirement. It is our drop
 * wording, useful to a human reading a vector and used by our own gate to catch
 * a rule firing for the wrong cause — a test that passes because the event was
 * rejected for a reason the vector was not about is a test that proves nothing.
 * Navcom implements no part of it and must not build against it.
 *
 * Deterministic: one fixed key, one fixed timestamp, so a rebuild produces
 * byte-identical files and a diff means a real change.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/make-observation-vectors.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils';
import {
  NAVCOM_SPEC_VERSION,
  NAVCOM_OBSERVATION_KIND,
} from '../src/services/intel/observations/adapters/navcomAdapter';

const OUT = path.join(process.cwd(), 'docs/spec/observation-vectors');

/** A fixed key. These vectors are public test data; the secret is worth nothing. */
const SK = hexToBytes('7f3e1d5c9b0a8462e7d1c4f60b93a5827de0c1b4a69f38d5027e4c1a9b6d3f80');
const PK = getPublicKey(SK);
const CREATED_AT = 1_756_000_000;
/** Unix seconds, as NavCom writes it: an hour before publication. */
const OBSERVED_AT = CREATED_AT - 3600;
/** NavCom's own test fixture's place, so both sides test the same event. */
const ANCHOR = 'st-louis/st-patrick-center';

/**
 * A well-formed event in NavCom's form, as its builder writes it (packages/core/src/directory/observation.ts,
 * read 2026-10-06 and again 2026-10-23): `g` the anchor's region slug, never a position; `d` the anchor; and the
 * observation in the content. Every vector below varies it by exactly one thing.
 */
const base = () => ({
  kind: NAVCOM_OBSERVATION_KIND,
  created_at: CREATED_AT,
  tags: [['g', 'st-louis'], ['d', ANCHOR]] as string[][],
  content: {
    anchor: ANCHOR, observed_at: OBSERVED_AT, tags: ['locked'], method: 'saw', callsign: 'Raven',
    precision: 'area', area: 'dp3w',
  } as Record<string, unknown> | string,
});

type Draft = ReturnType<typeof base>;
const vectors: Array<{ name: string; description: string }> = [];
/** The content of a draft, to vary one field of it. */
const fields = (e: Draft) => e.content as Record<string, unknown>;

function add(
  name: string,
  description: string,
  build: (e: Draft) => Draft | void,
  observations: number,
  reasonContains?: string,
  /** Applied AFTER signing — the only way to make a signature genuinely fail. */
  tamper?: (e: Record<string, unknown>) => void,
) {
  const draft = base();
  const shaped = (build(draft) ?? draft) as Draft;
  const event = { ...shaped, content: typeof shaped.content === 'string' ? shaped.content : JSON.stringify(shaped.content) };
  const signed = finalizeEvent(event as Parameters<typeof finalizeEvent>[0], SK) as unknown as Record<string, unknown>;
  tamper?.(signed);

  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify({
      name,
      description,
      expect: { observations },
      ...(reasonContains
        ? { diagnostic: { note: 'NOT normative — our drop wording, for humans and our own gate.', reasonContains } }
        : {}),
      event: signed,
    }, null, 2) + '\n',
  );
  vectors.push({ name, description });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ── Accepted ───────────────────────────────────────────────────────────────
add('valid-observation',
  'A well-formed field observation in NavCom\'s form. Derives one observation, positioned at the CENTRE of the 4-character geohash cell in content.area, with the cell radius as its precision — never at a point.',
  () => {}, 1);

add('two-tags-become-two-observations',
  'One event asserting two things about one anchor. Derives TWO observations, because corroboration works per (subject, attribute) claim and two claims in one record could otherwise never be corroborated or contradicted separately. Non-obvious from the prose; the most likely thing for a producer to get wrong.',
  (e) => { fields(e).tags = ['locked', 'crowded']; }, 2);

add('method-told-is-accepted',
  'Hearsay is accepted, not refused. It carries less weight than a first-hand sighting, but the weighing happens downstream from this adapter — dropping it here would discard real intelligence.',
  (e) => { fields(e).method = 'told'; }, 1);

add('method-inferred-is-accepted', 'Inference is the third method, and is accepted like the others.',
  (e) => { fields(e).method = 'inferred'; }, 1);

add('anonymous-callsign-is-accepted', 'An operator may file as `anonymous`; the key still tells two operators apart.',
  (e) => { fields(e).callsign = 'anonymous'; }, 1);

add('supersedes-own-account-is-accepted',
  'An author\'s later account names the event it replaces. Accepted; the earlier event, read in the same batch from the same author, is dropped.',
  (e) => { fields(e).supersedes = 'e'.repeat(64); }, 1);

add('region-slug-is-never-a-position',
  'The g tag is a region slug, and some slugs happen to parse as a geohash. It is never decoded: the position comes only from content.area, so this derives the same position as valid-observation.',
  (e) => { e.tags = [['g', 'dr5r'], ['d', ANCHOR]]; }, 1);

add('region-tag-absent-is-accepted', 'The g tag only lets an observation be asked for by region; without one it is still an observation.',
  (e) => { e.tags = [['d', ANCHOR]]; }, 1);

// ── Refused: authenticity and identity ─────────────────────────────────────
add('signature-invalid-refused',
  'Signed honestly, then the content was edited. Checked before anything else is read.',
  () => {}, 0, 'signature did not verify',
  (signed) => { signed.content = JSON.stringify({ ...JSON.parse(signed.content as string), tags: ['tampered'] }); });

add('wrong-kind-refused', 'Not kind 1911. A foreign event at a neighbouring integer is filtered, not misread.',
  (e) => { e.kind = 1910; }, 0, 'is not 1911');

// ── Refused: the two-stage release ─────────────────────────────────────────
add('refinement-event-refused',
  'Carries a refines tag: the exact half of a pair, published 48 hours later. Until a pair is read as one observation, ingesting both would double-count one sighting.',
  (e) => { e.tags.push(['refines', 'f'.repeat(64)]); }, 0, 'refinement event');

add('precision-exact-refused',
  'The refined release in its own right: precision exact, with coordinates instead of an area. Set aside for the same reason.',
  (e) => { const c = fields(e); delete c.area; c.precision = 'exact'; c.lat = 38.63; c.lon = -90.2; }, 0, 'precision "exact"');

// ── Refused: content ───────────────────────────────────────────────────────
add('content-not-json-refused', 'Content is not a JSON object. Parsed, never repaired.',
  (e) => { e.content = 'checkpoint at the harbour gate'; }, 0, 'content is not');

add('content-unbounded-field-refused',
  'Carries a free-text `notes` field. THE vector for this format: an unbounded field is the thing it exists to refuse, and accepting one here would reopen on our side the liability surface NavCom closed on theirs.',
  (e) => { fields(e).notes = 'the man in the blue coat was there again'; }, 0, 'outside the contract');

// ── Refused: the anchor ────────────────────────────────────────────────────
add('anchor-absent-refused', 'No anchor in the content. An observation with no subject cannot be corroborated by anything.',
  (e) => { delete fields(e).anchor; }, 0, 'content names no anchor');

add('anchor-tag-absent-refused', 'No d tag. The tags say what the content says, and the d tag is the anchor.',
  (e) => { e.tags = [['g', 'st-louis']]; }, 0, 'no d (anchor) tag');

add('anchor-tag-disagrees-refused', 'A d tag naming another place than the content does. Which subject the claim is about must not be a guess.',
  (e) => { e.tags = [['g', 'st-louis'], ['d', 'st-louis/somewhere-else']]; }, 0, 'is not the anchor the content names');

add('anchor-tag-repeated-refused', 'Two d tags. Ambiguous again, and refused rather than resolved by picking one.',
  (e) => { e.tags.push(['d', ANCHOR]); }, 0, 'is not the anchor the content names');

// ── Refused: time ──────────────────────────────────────────────────────────
add('observed-at-absent-refused',
  'No observed_at. Falling back to created_at would make a two-day-old sighting look fresh and a backfill look like a flood of new intelligence.',
  (e) => { delete fields(e).observed_at; }, 0, 'observed_at is absent');

add('observed-at-as-a-date-refused',
  'observed_at written as an ISO date rather than unix seconds, as an early draft had it. Refused, not converted.',
  (e) => { fields(e).observed_at = '2026-08-23T23:06:40.000Z'; }, 0, 'not unix seconds');

// ── Refused: method and callsign ───────────────────────────────────────────
add('method-absent-refused', 'No method. How the observer came to know is not optional; weight derives from it.',
  (e) => { delete fields(e).method; }, 0, 'is not one of saw, told, inferred');

add('method-unknown-refused', 'A method outside saw, told and inferred has no weight this consumer can derive.',
  (e) => { fields(e).method = 'measured'; }, 0, 'is not one of saw, told, inferred');

add('callsign-absent-refused', 'No callsign. `anonymous` is the word for an operator who gives none.',
  (e) => { delete fields(e).callsign; }, 0, 'callsign is absent');

add('callsign-too-long-refused', 'A callsign of 65 characters: bounded, so it cannot become a field for prose.',
  (e) => { fields(e).callsign = 'R'.repeat(65); }, 0, 'longer than a callsign is');

add('supersedes-malformed-refused', 'supersedes that is not an event id.',
  (e) => { fields(e).supersedes = 'my earlier one'; }, 0, 'supersedes is not an event id');

// ── Refused: precision and area ────────────────────────────────────────────
add('precision-absent-refused', 'No precision. It says which half of the two-stage release this is, and is required.',
  (e) => { delete fields(e).precision; }, 0, 'is not one of area, exact');

add('precision-unknown-refused', 'A precision outside the published table.',
  (e) => { fields(e).precision = 'street'; }, 0, 'is not one of area, exact');

add('area-absent-refused', 'An area observation with no area. An observation with no place is not one.',
  (e) => { delete fields(e).area; }, 0, 'names no area');

add('area-malformed-refused', 'Not a geohash: a, i, l and o are not in the base32 alphabet.',
  (e) => { fields(e).area = 'aiox'; }, 0, 'is not a geohash');

add('area-too-fine-refused',
  'A 6-character geohash. Refused even though it is MORE precise: an over-precise area has escaped the coarsening that protects the operator who filed it.',
  (e) => { fields(e).area = 'dp3wjz'; }, 0, 'an area is 4 characters');

add('area-too-coarse-refused', 'A 3-character geohash. An area is exactly four characters, as NavCom\'s builder writes it.',
  (e) => { fields(e).area = 'dp3'; }, 0, 'an area is 4 characters');

// ── Refused: vocabulary ────────────────────────────────────────────────────
add('tags-absent-refused', 'No tags. An observation asserting nothing is not one.',
  (e) => { delete fields(e).tags; }, 0, 'no tags');

add('tags-not-members-refused', 'A tag that is not a bare lower-case member: NavCom writes `locked`, never `facility.Locked`.',
  (e) => { fields(e).tags = ['facility.Locked']; }, 0, 'are not vocabulary members in shape');

add('tags-too-many-refused', 'Nine tags. NavCom\'s limit is eight.',
  (e) => { fields(e).tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']; }, 0, 'are not vocabulary members in shape');

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  format: 'NavCom field observations (kind 1911), in the form NavCom\'s builder writes, as Starcom consumes them',
  contract: NAVCOM_SPEC_VERSION,
  kind: NAVCOM_OBSERVATION_KIND,
  direction: 'Navcom produces, Starcom consumes. These describe THIS consumer\'s decisions, not the wire format, which Navcom owns.',
  generatedBy: 'scripts/make-observation-vectors.ts',
  deterministic: true,
  signedBy: PK,
  normative: 'expect.observations only. `diagnostic` is our drop wording — useful to read, not something to implement against.',
  count: vectors.length,
  vectors: vectors.map((v) => ({ ...v, file: `${v.name}.json` })),
}, null, 2) + '\n');

console.log(`  ${vectors.length} observation vectors written to ${path.relative(process.cwd(), OUT)}`);
