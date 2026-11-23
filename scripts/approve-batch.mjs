#!/usr/bin/env node
/**
 * The approval gate for claims that arrive by the thousand.
 *
 * ─── WHY THIS IS NOT JUST claims/ WITH MORE FILES ──────────────────────────
 *
 * The single-claim gate is a person reading a claim and committing it. That
 * works because reading it is the approval. It does not survive contact with
 * 9,591 PSC controllers: nobody reads ten thousand claims, and committing ten
 * thousand files while pretending otherwise would turn the gate into a costume.
 * A gate that cannot be honestly satisfied is worse than no gate, because it
 * launders unreviewed output through a ritual that looks like review.
 *
 * So the unit of approval changes. A person cannot vouch for ten thousand
 * conclusions, but they CAN vouch for a procedure — provided the procedure is
 * deterministic, its inputs are pinned by hash, and the machine can later prove
 * the output is exactly what that procedure produced from those inputs.
 *
 * That is the whole design:
 *
 *   the human approves   a generator, its parameters, and hashed inputs
 *   the machine proves   the published claims are precisely that generator's
 *                        output over precisely those inputs, and nothing else
 *
 * The human's signature then means something specific and falsifiable, rather
 * than meaning "someone clicked approve on a very long list".
 *
 * ─── WHAT A REVIEWER IS ACTUALLY SHOWN ─────────────────────────────────────
 *
 * Not ten thousand claims. Four things a person can genuinely hold:
 *
 *   1. the CRITERIA — the one sentence every claim in the batch asserts
 *   2. a SAMPLE — drawn by a recorded seed, so it cannot be cherry-picked, and
 *      re-drawable by anyone checking the approval afterwards
 *   3. the DISTRIBUTION — how many claims, what weights, which weakBacking
 *      strings appear and how often
 *   4. the REFUSALS — what the generator declined to emit and why. A generator
 *      that refuses nothing has no filter, and that is a finding about the
 *      generator rather than a clean run.
 *
 * The extremes are shown alongside the sample, always. A uniform random sample
 * of ten thousand rows will almost never contain the strangest one, and the
 * strangest one is what a reviewer most needs to see.
 *
 * ─── WHAT THIS DELIBERATELY CANNOT DO ──────────────────────────────────────
 *
 * It cannot approve anything. `prepare` writes a DRAFT with the review block
 * empty; a draft is refused at publish time. Only a person filling that block
 * in and committing it turns a draft into an approval, and no flag to this
 * script does it for them.
 *
 * Usage:
 *   node scripts/approve-batch.mjs prepare <generator.mjs> [--out claims/batches/x.batch.json]
 *   node scripts/approve-batch.mjs verify  <batch.json>
 *
 * A generator is any module default-exporting { criteria, inputs, run() },
 * where run() returns { claims: [...], refusals: [{reason, count}] } and is a
 * pure function of the files named in inputs.
 *
 * Exit: 0 verified / prepared · 1 drift, malformed, or unapproved
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import * as peer from './peer/peer.mjs';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = (p) => sha256(fs.readFileSync(p));

/**
 * Deterministic sampling. Math.random() would make an approval unreproducible:
 * a later reviewer could not redraw the sample the approver claims to have
 * read, so the recorded sample would be an assertion rather than a check.
 */
function seededPick(items, n, seed) {
  const picked = [];
  const used = new Set();
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  let i = 0;
  while (picked.length < Math.min(n, items.length)) {
    if (i >= h.length - 4) { h = crypto.createHash('sha256').update(h).digest(); i = 0; }
    const idx = h.readUInt32BE(i) % items.length;
    i += 4;
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push({ index: idx, claim: items[idx] });
  }
  return picked.sort((a, b) => a.index - b.index);
}

/** The manifest is what the approval is really over: an ordered digest of every
 *  claim. One byte different anywhere and the batch no longer matches. */
function manifestOf(claims) {
  const lines = claims.map((c) => sha256(peer.canonical(c)));
  return { manifestSha256: sha256(lines.join('\n')), claimCount: claims.length };
}

async function loadGenerator(file) {
  const abs = path.resolve(file);
  const mod = await import(abs);
  const g = mod.default ?? mod;
  for (const k of ['criteria', 'inputs', 'run']) {
    if (!g[k]) throw new Error(`generator is missing "${k}"`);
  }
  return g;
}

/** Every claim must pass the spec before a human is asked about the batch.
 *  Reviewing conclusions drawn by a generator that emits malformed claims
 *  wastes the one scarce resource here, which is human attention. */
function conformanceCheck(claims) {
  const bad = [];
  for (let i = 0; i < claims.length; i++) {
    const r = peer.rejectionReason(claims[i]);
    if (r) bad.push({ index: i, reason: r });
    if (bad.length >= 10) break;
  }
  return bad;
}

const [, , cmd, target, ...rest] = process.argv;
const flag = (n, d) => { const i = rest.indexOf(n); return i !== -1 ? rest[i + 1] : d; };

if (cmd === 'prepare') {
  if (!target) { console.error('\n  usage: approve-batch.mjs prepare <generator.mjs>\n'); process.exit(1); }
  const gen = await loadGenerator(target);
  const seed = Number(flag('--seed', 1));
  const sampleSize = Number(flag('--sample', 25));

  const inputs = gen.inputs.map((p) => ({ path: p, sha256: sha256File(p), bytes: fs.statSync(p).size }));
  const { claims, refusals = [] } = await gen.run();

  const bad = conformanceCheck(claims);
  if (bad.length) {
    console.error(`\n  ${bad.length}+ claim(s) do not conform to the spec. Nothing to review yet:\n`);
    for (const b of bad) console.error(`    #${b.index}  ${b.reason}`);
    console.error('');
    process.exit(1);
  }

  const { manifestSha256, claimCount } = manifestOf(claims);
  const weights = claims.map((c) => peer.deriveWeight(c).weight);
  const weak = {};
  for (const c of claims) for (const w of c.method.weakBacking) weak[w] = (weak[w] ?? 0) + 1;

  const sample = seededPick(claims, sampleSize, seed);
  // The extremes never appear reliably in a random sample, and they are what a
  // reviewer most needs: the strangest row is where a bad generator shows.
  const order = claims.map((c, i) => ({ i, w: peer.deriveWeight(c).weight })).sort((a, b) => a.w - b.w);
  const extremes = [order[0], order[order.length - 1]].filter(Boolean);

  console.log(`\n  BATCH REVIEW — ${claimCount} claims from ${path.basename(target)}\n`);
  console.log(`  CRITERIA (asserted by every claim here)`);
  console.log(`    ${gen.criteria}\n`);
  console.log(`  INPUTS (pinned by hash — the approval is void if these change)`);
  for (const i of inputs) console.log(`    ${i.path}  ${i.sha256.slice(0, 16)}…  ${i.bytes} bytes`);
  console.log(`\n  DISTRIBUTION`);
  console.log(`    weight   min ${Math.min(...weights).toFixed(3)}  median ${weights.slice().sort((a,b)=>a-b)[weights.length>>1].toFixed(3)}  max ${Math.max(...weights).toFixed(3)}`);
  console.log(`    weakBacking strings:`);
  for (const [w, n] of Object.entries(weak).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(6)}×  ${w}`);
  if (!Object.keys(weak).length) console.log(`      (none — every claim asserts it found no weak backing)`);
  console.log(`\n  REFUSALS (what the generator declined to emit)`);
  if (!refusals.length) {
    console.log(`      none — WORTH A LOOK. A generator that refuses nothing has no filter,`);
    console.log(`      which is a fact about the generator rather than a clean run.`);
  } else for (const r of refusals) console.log(`      ${String(r.count).padStart(6)}×  ${r.reason}`);

  console.log(`\n  SAMPLE (seed ${seed}, redraw with the same seed to check this)`);
  for (const { index, claim } of sample) {
    console.log(`    #${index}  ${claim.claim.subjectRef} ${claim.claim.attribute} = ${JSON.stringify(claim.claim.value)}  w=${peer.deriveWeight(claim).weight.toFixed(3)}`);
  }
  console.log(`\n  EXTREMES (always shown; a random sample will not contain them)`);
  for (const e of extremes) {
    const c = claims[e.i];
    console.log(`    #${e.i}  ${c.claim.subjectRef} ${c.claim.attribute} = ${JSON.stringify(c.claim.value)}  w=${e.w.toFixed(3)}`);
  }

  const out = flag('--out', `claims/batches/${path.basename(target).replace(/\.mjs$/, '')}.batch.json`);
  const draft = {
    batch: path.basename(out).replace(/\.batch\.json$/, ''),
    generator: { script: target, sha256: sha256File(target) },
    inputs,
    criteria: gen.criteria,
    expected: { claimCount, manifestSha256 },
    sampling: { seed, sampleSize, sampledIndices: sample.map((s) => s.index) },
    // Empty on purpose. This is the gate, and no flag to this script fills it.
    review: null,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(draft, null, 2) + '\n');

  console.log(`\n  DRAFT written to ${out}`);
  console.log(`  It will NOT publish while "review" is null. To approve, a person adds:\n`);
  console.log(`      "review": {`);
  console.log(`        "reviewer": "<who>",`);
  console.log(`        "reviewedAt": "<ISO date>",`);
  console.log(`        "attests": "I read the criteria, the sampled claims and the extremes above,"`);
  console.log(`                   "and the distribution and refusal counts. I approve this generator"`);
  console.log(`                   "over these pinned inputs — not each claim individually."`);
  console.log(`      }\n`);
  console.log(`  and commits it. That commit is the approval.\n`);
  process.exit(0);
}

if (cmd === 'verify') {
  if (!target) { console.error('\n  usage: approve-batch.mjs verify <batch.json>\n'); process.exit(1); }
  const batch = JSON.parse(fs.readFileSync(target, 'utf8'));
  let failed = 0;
  const bad = (m) => { failed++; console.log(`  FAIL  ${m}`); };
  const ok = (m) => console.log(`  ok    ${m}`);

  console.log(`\n  VERIFYING ${batch.batch}\n`);

  if (!batch.review || !batch.review.reviewer || !batch.review.attests) {
    bad('unapproved — "review" is empty, so no person has vouched for this batch');
  } else ok(`approved by ${batch.review.reviewer} on ${batch.review.reviewedAt}`);

  // Inputs first. If the data moved, the approval was over something else, and
  // re-running the generator would silently launder new data through an old
  // signature — the exact failure this gate exists to prevent.
  for (const i of batch.inputs) {
    if (!fs.existsSync(i.path)) { bad(`input missing: ${i.path}`); continue; }
    const now = sha256File(i.path);
    now === i.sha256 ? ok(`input unchanged: ${i.path}`) : bad(`input CHANGED since approval: ${i.path}`);
  }

  const genNow = fs.existsSync(batch.generator.script) ? sha256File(batch.generator.script) : null;
  if (!genNow) bad(`generator missing: ${batch.generator.script}`);
  else genNow === batch.generator.sha256 ? ok('generator unchanged') : bad('generator CHANGED since approval');

  if (failed) {
    console.log(`\n  ${failed} failure(s). Nothing may publish from this batch.`);
    console.log(`  Re-run prepare and have a person review it again — a changed input or`);
    console.log(`  generator is a different batch wearing an old approval.\n`);
    process.exit(1);
  }

  const gen = await loadGenerator(batch.generator.script);
  const { claims } = await gen.run();
  const { manifestSha256, claimCount } = manifestOf(claims);

  claimCount === batch.expected.claimCount
    ? ok(`claim count matches: ${claimCount}`)
    : bad(`claim count ${claimCount}, approved ${batch.expected.claimCount}`);
  manifestSha256 === batch.expected.manifestSha256
    ? ok('every claim byte-identical to what was approved')
    : bad('manifest differs — the generator is not reproducing the approved output');

  // The sample the approver says they read must still be the sample the seed
  // draws. Otherwise the recorded review describes claims nobody looked at.
  const redrawn = seededPick(claims, batch.sampling.sampleSize, batch.sampling.seed).map((s) => s.index);
  JSON.stringify(redrawn) === JSON.stringify(batch.sampling.sampledIndices)
    ? ok('sample redraws identically — the reviewer saw these exact claims')
    : bad('sample no longer redraws the same claims');

  console.log(`\n  ${failed ? `${failed} failure(s) — refuse to publish` : `verified — ${claimCount} claims may publish`}\n`);
  process.exit(failed ? 1 : 0);
}

console.error(`
  usage:
    approve-batch.mjs prepare <generator.mjs> [--seed N] [--sample N] [--out path]
    approve-batch.mjs verify  <batch.json>
`);
process.exit(1);
