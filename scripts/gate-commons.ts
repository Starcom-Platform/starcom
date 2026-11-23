/**
 * @asserts A stranger with no wallet, no install and no JavaScript can read what we published, and cannot be misled by it.
 *
 * Phase gate for the public read surface (docs/build-order.md, W6).
 *
 * The claim this gate defends: a stranger with no wallet, no install, and no
 * JavaScript can read what we published AND cannot be misled by it.
 *
 * Each assertion below exists because the failure it describes actually
 * occurred and was caught by looking at the rendered page rather than by any
 * automated check:
 *
 *  1. A tampered payload rendered a weight of 0.7491 beside its own
 *     "SIGNATURE DID NOT VERIFY" badge. Every input to that number lives in
 *     the payload the attacker controls, so it read as measurement while being
 *     nothing of the kind.
 *  2. The index sorted purely by weight, so the same tampered claim outranked
 *     verified ones — ranking decided by attacker-supplied numbers.
 *  3. Payloads missing required spec fields rendered the literal string
 *     "undefined" into public pages ("Subject is undefined").
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/gate-commons.ts
 * (Plain Node rather than vitest deliberately — vitest resolves two copies of
 * @noble/hashes and ML-DSA verification fails inside it, the same reason
 * gate-federation runs this way.)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signFinding } from '../src/services/intel/findings/signFinding';

// Node 18 does not expose webcrypto as an ESM global; ml_dsa65.keygen needs it.
if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'commons-gate-'));
const IN = path.join(tmp, 'in');
const OUT = path.join(tmp, 'out');
fs.mkdirSync(IN, { recursive: true });

const attestation = (subject: string, sourceCount: number, hoursAgo: number) => ({
  schemaVersion: 2,
  claim: { subjectRef: subject, subjectKind: 'object' as const, attribute: 'location', value: { lat: 51.5, lon: -0.12 } },
  publishedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  method: {
    algorithm: 'location-corroboration' as const,
    algorithmVersion: 1,
    criteria: `${sourceCount} independent sources within 24h and 5km`,
    sourceCount,
    observedFrom: new Date(Date.now() - (hoursAgo + 20) * 3_600_000).toISOString(),
    observedTo: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    inputFingerprints: Array.from({ length: sourceCount }, (_, i) => `fp${subject.length}${i}`.padEnd(32, '0')),
  },
});

const write = (name: string, v: unknown) => fs.writeFileSync(path.join(IN, `${name}.json`), JSON.stringify(v, null, 2));

// Two genuine publishers, each with their own key. `weak` is old and thinly
// sourced so it must derive a LOWER weight than `strong` — otherwise the
// ordering assertion below would pass by coincidence.
write('strong', signFinding(attestation('MV Northwind', 4, 6) as never, ml_dsa65.keygen().secretKey));
write('weak', signFinding(attestation('MV Southgate', 2, 400) as never, ml_dsa65.keygen().secretKey));

// Tampered: signed honestly, then edited. Its method claims maximum
// corroboration, so a weight-only sort would place it FIRST.
const tampered = JSON.parse(fs.readFileSync(path.join(IN, 'strong.json'), 'utf8'));
tampered.content.claim.subjectRef = 'MV Tampered';
tampered.content.claim.value = { lat: 0, lon: 0 };
write('tampered', tampered);

// Malformed: valid signature over a payload missing required spec fields.
const malformed = attestation('MV Malformed', 3, 1) as Record<string, never>;
delete (malformed.claim as unknown as Record<string, unknown>).subjectKind;
delete (malformed.method as unknown as Record<string, unknown>).observedFrom;
write('malformed', signFinding(malformed as never, ml_dsa65.keygen().secretKey));

// 2>&1 — the malformed report is written to stderr on purpose, and a check
// that only read stdout would pass whether or not the report was ever emitted.
const res = execFileSync('sh', ['-c', `node scripts/build-commons.mjs '${IN}' '${OUT}' 2>&1`], { encoding: 'utf8' });

const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const page = (frag: string) => {
  const f = fs.readdirSync(path.join(OUT, 'claim')).find((n) => n.includes(frag));
  return f ? fs.readFileSync(path.join(OUT, 'claim', f), 'utf8') : '';
};

const failures: string[] = [];
const check = (name: string, ok: boolean) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures.push(name); };

console.log('Public read surface gate\n');

check('malformed payload is not published at all', page('malformed') === '');
check('malformed payload is reported, not silently dropped', /NOT published/.test(res) && /claim\.subjectKind/.test(res));
check('no page contains the literal string "undefined"',
  !fs.readdirSync(path.join(OUT, 'claim')).some((f) => fs.readFileSync(path.join(OUT, 'claim', f), 'utf8').includes('undefined')) && !index.includes('undefined'));

const t = page('tampered');
check('tampered page is published but marked unverified', /SIGNATURE DID NOT VERIFY/.test(t));
check('tampered page shows NO derived weight', !/<th><strong>Weight/.test(t) && /No weight is shown/.test(t));
check('verified page DOES show its weight decomposition', /<th><strong>Weight/.test(page('northwind')));

const order = [...index.matchAll(/<a href="claim\/([^"]+)"/g)].map((m) => m[1]);
check('verified claims outrank unverified regardless of weight',
  order.findIndex((s) => s.includes('tampered')) === order.length - 1);
check('index shows no weight for an unverified row',
  /MV Tampered<\/a>[\s\S]{0,160}?<td><span class="muted">&mdash;<\/span><\/td>/.test(index));
/**
 * Every publishable vector must render with the weight the spec says, to 3dp.
 *
 * Evaluated at the vector's own `evaluatedAt` is not possible here — the
 * builder uses the current time — so this compares the DECOMPOSITION, which is
 * time-independent except for recency, and checks recency separately by
 * requiring the census page to age from its snapshot rather than its
 * publication date.
 */
/**
 * The published conformance vectors, through the public surface.
 *
 * build-commons.mjs is a fourth independent implementation of the weight
 * derivation, and the only one outsiders read. It shipped handling ONLY the
 * corroboration case: an enumeration scored 0.25 instead of 1, a relayed claim
 * kept full corroboration, and a census was captioned "1 independent source".
 * The fixtures above could never have caught that — they are all
 * distance-matched, single-shape findings written alongside the code they test.
 *
 * ONE BUILD PER VECTOR, deliberately. Several vectors deliberately share a
 * subject and author, which under a parameterized-replaceable kind is the SAME
 * SLOT — the surface correctly keeps one and drops the rest. Feeding them as a
 * corpus silently published only one and read its page for all of them, which
 * passed a check that was measuring the wrong claim.
 */
const VECTORS = path.join(process.cwd(), 'docs/spec/vectors');
for (const file of fs.readdirSync(VECTORS)) {
  if (!file.endsWith('.json') || file === 'index.json') continue;
  const v = JSON.parse(fs.readFileSync(path.join(VECTORS, file), 'utf8'));
  // Rejection vectors are gate-conformance's job; here they are merely absent.
  if (!v.expect?.signatureValid || v.expect?.rejectReason || !v.expect?.weight) continue;
  const name = file.replace(/\.json$/, '');

  const vIn = path.join(tmp, `v-in-${name}`);
  const vOut = path.join(tmp, `v-out-${name}`);
  fs.mkdirSync(vIn, { recursive: true });
  fs.writeFileSync(path.join(vIn, 'claim.json'), JSON.stringify(v.event, null, 2));
  execFileSync('sh', ['-c', `node scripts/build-commons.mjs '${vIn}' '${vOut}' 2>&1`], { encoding: 'utf8' });

  const dir = path.join(vOut, 'claim');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const html = files.length === 1 ? fs.readFileSync(path.join(dir, files[0]), 'utf8') : '';
  const want = v.expect.weight as { corroboration?: number; precision?: number };
  const shown = Number(/(?:Completeness|[Cc]orroboration)<\/th><td>([0-9.]+)/.exec(html)?.[1] ?? NaN);
  const shownPrec = Number(/[Pp]recision<\/th><td>([0-9.]+)/.exec(html)?.[1] ?? NaN);

  check(`vector ${name}: published as exactly one page`, files.length === 1);
  check(`vector ${name}: public page derives corroboration ${want.corroboration}`,
    Math.abs(shown - (want.corroboration ?? -1)) < 0.001);
  check(`vector ${name}: public page derives precision ${want.precision}`,
    Math.abs(shownPrec - (want.precision ?? -1)) < 0.001);

  if (name === 'relayed-sources') {
    check('a relayed claim says on the page that its sources shared a delivery path',
      /all relayed via wikidata/.test(html));
  }
  if (name === 'enumeration-census') {
    check('a census page does not caption itself "independent sources"', !/independent source/i.test(html));
    check('a census page names the boundary it counted', /Counted from<\/th><td>Every company/.test(html));
    /**
     * The NUMBER, not the caption.
     *
     * This check first asserted only that the page said "measured from the
     * snapshot date" — static template text that reads the same however the
     * value was computed. It passed a mutation that aged the claim from
     * publishedAt, which is exactly the defect it exists to catch.
     */
    const m = v.event.content.method as { observedTo: string };
    const halfLife = 180;
    const fromSnapshot = Math.pow(0.5, ((Date.now() - Date.parse(m.observedTo)) / 86_400_000) / halfLife);
    const fromPublished = Math.pow(0.5, ((Date.now() - Date.parse(v.event.content.publishedAt)) / 86_400_000) / halfLife);
    const shownRecency = Number(/[Rr]ecency<\/th><td>([0-9.]+)/.exec(html)?.[1] ?? NaN);

    check('the census vector separates the two ageing bases at all',
      Math.abs(fromSnapshot - fromPublished) > 0.05);
    check('a census page ages from the snapshot, not the publication date',
      Math.abs(shownRecency - fromSnapshot) < 0.002);
  }
}

/**
 * A claim whose value is an object must read as a sentence, not as JSON.
 *
 * `value` is untyped in the format because what a claim asserts varies, and
 * this page stringified whatever it was handed — so a same-day incorporation
 * batch appeared as {"date":"2025-07-18","count":19} on the one surface built
 * for people who are not reading JSON.
 */
const objectValued = {
  ...attestation('MV Batchwind', 1, 2),
  claim: {
    subjectRef: '120 CHARING CROSS ROAD, WC2H 0JR', subjectKind: 'place' as const,
    attribute: 'largestSameDayIncorporationBatch', value: { date: '2025-07-18', count: 19 },
  },
};
const objIn = path.join(tmp, 'obj-in');
const objOut = path.join(tmp, 'obj-out');
fs.mkdirSync(objIn, { recursive: true });
fs.writeFileSync(path.join(objIn, 'c.json'), JSON.stringify(signFinding(objectValued as never, ml_dsa65.keygen().secretKey), null, 2));
execFileSync('sh', ['-c', `node scripts/build-commons.mjs '${objIn}' '${objOut}' 2>&1`], { encoding: 'utf8' });
const objDir = path.join(objOut, 'claim');
const objHtml = fs.existsSync(objDir) ? fs.readFileSync(path.join(objDir, fs.readdirSync(objDir)[0]), 'utf8') : '';
check('an object-valued claim reads as a sentence', /19<\/strong> on <strong>2025-07-18/.test(objHtml));
check('an object-valued claim is not printed as raw JSON', !objHtml.includes('{&quot;date&quot;'));

check('the surface needs no JavaScript', !/<script/i.test(index) && !/<script/i.test(t));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failures.length ? `GATE FAILED: ${failures.length} check(s)` : 'Gate passed.'}`);
process.exit(failures.length ? 1 : 0);
