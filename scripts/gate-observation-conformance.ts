/**
 * @asserts Every published observation vector produces, through the real navcomAdapter, exactly the verdict the vector states.
 *
 * The consumer-side counterpart to gate-conformance.ts.
 *
 * The vectors in docs/spec/observation-vectors/ are published so Navcom can
 * test their producer. This points them back at the adapter we actually ship,
 * which is what stops them becoming decoration — a published vector that our
 * own consumer disagrees with is worse than no vector, because a peer builds to
 * it and we reject what they send.
 *
 * Two things are checked per vector, and the second matters more than it looks:
 *
 *   the COUNT      how many observations a conforming consumer derives. This
 *                  is the normative half.
 *   the REASON     that a refused event was refused for the reason the vector
 *                  is about. A vector asserting "0 observations" passes just as
 *                  happily when the event is dropped for an unrelated defect,
 *                  and would then be testing nothing — which is exactly how a
 *                  fixture with an invented `precision: 'cell'` value sat green
 *                  in this repository until Navcom stated the real values.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/gate-observation-conformance.ts
 * Exit: 0 all vectors agree · 1 one does not
 */
import fs from 'node:fs';
import path from 'node:path';
import { verifyEvent } from 'nostr-tools/pure';
import {
  createNavcomAdapter,
  type NavcomRawEvent,
} from '../src/services/intel/observations/adapters/navcomAdapter';

const DIR = 'docs/spec/observation-vectors';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

/*
 * `vocabulary: () => null` — membership deliberately NOT checked.
 *
 * The closed vocabulary is fetched from Navcom at runtime and is explicitly a
 * stub awaiting local knowledge, so whether a tag is a member is a property of
 * a live document, not of the event. Vectors describe events. Checking it here
 * would make this gate fail whenever their list changed, which is the drift the
 * adapter refuses to pin for.
 */
const adapter = createNavcomAdapter({
  verifySignature: (e) => verifyEvent(e as Parameters<typeof verifyEvent>[0]),
  vocabulary: () => null,
});

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

console.log('Observation conformance gate\n');

if (!Array.isArray(index.vectors) || index.vectors.length === 0) {
  console.error('  No vectors in the index. Refusing to report conformance against nothing.');
  process.exit(1);
}

for (const entry of index.vectors as { name: string; file: string }[]) {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, entry.file), 'utf8'));
  const { observations, dropped } = adapter.toObservations([v.event as NavcomRawEvent]);

  if (observations.length !== v.expect.observations) {
    check(entry.name, false,
      `expected ${v.expect.observations} observation(s), got ${observations.length}`
      + (dropped.length ? ` (dropped: ${dropped[0].reason})` : ''));
    continue;
  }

  const wanted = v.diagnostic?.reasonContains;
  if (v.expect.observations === 0 && wanted) {
    const reason = dropped[0]?.reason ?? '';
    if (!reason.includes(wanted)) {
      check(entry.name, false, `refused for the wrong reason — wanted "${wanted}", got "${reason}"`);
      continue;
    }
  }
  check(entry.name, true);
}

/*
 * The accept side, asserted once on the canonical vector.
 *
 * A count alone would pass while the derived fields were wrong, and those are
 * the fields a peer's whole obligation set rests on: the position must be the
 * CELL rather than a point, the upstream author must survive so Navcom's events
 * do not corroborate themselves, and the record id must be retrievable so a
 * third party can walk the derivation back to the event.
 */
const valid = JSON.parse(fs.readFileSync(path.join(DIR, 'valid-observation.json'), 'utf8'));
const [obs] = adapter.toObservations([valid.event as NavcomRawEvent]).observations;
check('valid-observation carries the cell radius, not a point', Boolean(obs?.geoPrecisionM && obs.geoPrecisionM > 0),
  `geoPrecisionM=${String(obs?.geoPrecisionM)}`);
check('valid-observation keeps the upstream author distinct from the feed',
  obs?.upstreamSourceId === valid.event.pubkey && obs?.sourceId !== obs?.upstreamSourceId,
  `upstreamSourceId=${String(obs?.upstreamSourceId)}`);
check('valid-observation keeps a retrievable record id',
  obs?.sourceRecordId === valid.event.id, `sourceRecordId=${String(obs?.sourceRecordId)}`);
// The g tag is a region slug, never a position: a slug that parses as a geohash moves nothing.
const slug = JSON.parse(fs.readFileSync(path.join(DIR, 'region-slug-is-never-a-position.json'), 'utf8'));
const [atSlug] = adapter.toObservations([slug.event as NavcomRawEvent]).observations;
check('region-slug-is-never-a-position is placed by its area, not its g tag',
  atSlug?.geo?.lat === obs?.geo?.lat && atSlug?.geo?.lon === obs?.geo?.lon,
  `slug at ${String(atSlug?.geo?.lat)},${String(atSlug?.geo?.lon)}; area at ${String(obs?.geo?.lat)},${String(obs?.geo?.lon)}`);

console.log(
  failures.length
    ? `\n  OBSERVATION CONFORMANCE — FAILED\n\n  ${failures.length} of ${index.vectors.length + 4} check(s) disagree.\n`
    : `\n  OBSERVATION CONFORMANCE\n\n  ${index.vectors.length} vector(s) + 4 derived-field checks agree with the shipped adapter.\n`,
);
process.exit(failures.length ? 1 : 0);
