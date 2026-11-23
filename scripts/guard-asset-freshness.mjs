#!/usr/bin/env node
/**
 * @asserts Every committed data asset carries a date and none has decayed past the tolerance its weight assumes.
 *
 * Committed data assets go stale silently, and weight decays from their date.
 *
 * An enumeration's weight is its stated boundary and its age. The age is
 * measured from the snapshot, so every claim built on a committed asset loses
 * value every day the asset is not refreshed — and nothing looked at it.
 * Nothing failed, nothing warned, and the number simply got smaller. A
 * register at recency 0.4 still publishes; it just publishes something worth
 * less than half what it was, without saying so.
 *
 * This does NOT fail on ordinary staleness. A guard that goes red because
 * somebody has not re-run a fetcher is a guard that reports on housekeeping
 * rather than on the code, and the live-network tests already taught this
 * project what that costs. It fails only past the point where a claim built
 * from the asset would be misleading to publish, and prints the recency every
 * asset currently confers so the cost is visible before it is a failure.
 *
 * Usage: node scripts/guard-asset-freshness.mjs
 * Exit:  0 all within tolerance · 1 at least one past it
 */
import fs from 'node:fs';
import path from 'node:path';
// Shared with scripts/publish-health.mjs. That endpoint reports the same
// provenance states this guard fails on; if the two ever disagreed, Starcom
// would publish a claim about its own reliability that its own gate
// contradicts.
import { ASSETS, retention, HALF_LIFE_DAYS } from './lib/assetProvenance.mjs';


/**
 * What each source publishes, and how old is too old.
 *
 * `cadenceDays` is the publisher's own refresh interval — the fastest anyone
 * could be current. `maxAgeDays` is where a claim from this asset stops being
 * worth publishing, set at several cadences so a missed refresh is a warning
 * and a forgotten source is a failure.
 */


const DIR = path.join(process.cwd(), 'public', 'data');
const now = Date.now();
let failures = 0;
let warnings = 0;
let unreproducible = 0;

console.log('\n  Committed data assets — age, and the recency it confers\n');

for (const a of ASSETS) {
  const p = path.join(DIR, a.file);
  if (!fs.existsSync(p)) {
    /*
     * A FAILURE, not a remark.
     *
     * This printed ABSENT and continued without touching `failures`, so the
     * guard's entire subject could vanish while it reported success: delete
     * public/data/gleif.json and it printed "ABSENT GLEIF Global LEI Index"
     * followed by "Asset freshness guard passed" and exited 0. Delete all four
     * and it still exited 0.
     *
     * The inversion is visible in the branch immediately below, which DOES
     * fail when an asset carries no snapshot date, reasoning that a source
     * which will not say when it was taken cannot be published at all. An
     * asset that is not there says even less.
     *
     * It matters beyond tidiness: recency is derived from these snapshot
     * dates, so a missing file means every claim built on it is weighted from
     * a date nothing read — an asserted weight wearing a derived one's
     * clothes, which is the one thing this project's evidence rules forbid.
     */
    console.log(`  ABSENT   ${a.label} — ${a.file} is not committed`);
    failures++;
    continue;
  }

  const asset = JSON.parse(fs.readFileSync(p, 'utf8'));
  const snapshot = asset.snapshot ?? asset.retrievedAt;
  if (!snapshot || Number.isNaN(Date.parse(snapshot))) {
    // A source that will not say when it was taken cannot be published as an
    // enumeration at all, so this is a failure rather than a warning.
    console.log(`  FAIL     ${a.label} — no usable snapshot date`);
    failures++;
    continue;
  }

  const ageDays = Math.max(0, (now - Date.parse(snapshot)) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  const stale = ageDays > a.maxAgeDays;
  const overdue = ageDays > a.cadenceDays * 3;
  const state = stale ? 'FAIL    ' : overdue ? 'STALE   ' : 'ok      ';

  console.log(
    `  ${state} ${a.label.padEnd(30)} ${String(snapshot).slice(0, 10)}  `
    + `${ageDays.toFixed(0).padStart(4)}d  recency ${recency.toFixed(3)}  `
    + `(publisher refreshes every ${a.cadenceDays}d)`,
  );

  const r = retention(asset);
  const mark = r.state === 'UNREPRODUCIBLE' ? '  !! ' : '     ';
  console.log(`${mark}       provenance: ${r.state} — ${r.detail}`);
  if (r.state === 'UNREPRODUCIBLE') unreproducible++;

  if (stale) failures++;
  else if (overdue) warnings++;
}

if (unreproducible) {
  console.log(`\n  ${unreproducible} asset(s) whose source bytes nobody can obtain: the url is undated and`);
  console.log('  no copy was kept. Claims built from them cannot be checked by anyone, including');
  console.log('  us. Re-run the fetcher with --archive, or accept that those counts are take-our-word.');
}

if (warnings) {
  console.log(`\n  ${warnings} asset(s) overdue for a refresh. Not a failure — the claims are still`);
  console.log('  honest, they are just worth less than they could be. Re-run the fetcher.');
}

console.log(failures
  ? `\nASSET FRESHNESS FAILED: ${failures} asset(s) too old to publish from.\n`
  : '\nAsset freshness guard passed.\n');
process.exit(failures ? 1 : 0);
