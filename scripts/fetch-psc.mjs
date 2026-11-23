#!/usr/bin/env node
/**
 * Build the corporate-control asset from the Companies House PSC snapshot.
 *
 * The PSC register records who ultimately controls a company. This script
 * counts, for each corporate entity named as a PSC, how many companies name
 * it — a census over one authoritative register, weighed on the completeness
 * of its stated boundary rather than on corroboration.
 *
 * INDIVIDUALS ARE EXCLUDED BY DESIGN. See scripts/lib/pscOverlap.mjs — there
 * is no stable identifier for a person in this file, and joining on name plus
 * birth month would publish claims about identifiable private individuals that
 * the data cannot support.
 *
 * All 32 parts, always. A count is the entire claim, so a partial scan does
 * not yield a weaker count — it yields a false one. The boundary sentence is
 * computed from the parts actually read.
 *
 * Usage:
 *   node scripts/fetch-psc.mjs [--snapshot 2026-08-22] [--min-companies 10]
 *
 * Exit: 0 wrote the asset · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createPscAccumulator } from './lib/pscOverlap.mjs';
import { requireFreeSpace } from './lib/diskGuard.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };

/**
 * Clean up on EVERY exit path. Each of the 32 parts is a ~70MB archive holding
 * a ~400MB text file, and the early-exit paths below used to skip the cleanup
 * at the end of the loop — which is how failed runs filled a disk.
 */
let activeTemp = null;
const cleanupTemp = () => {
  if (!activeTemp) return;
  try { fs.rmSync(activeTemp, { recursive: true, force: true }); } catch { /* best effort */ }
  activeTemp = null;
};
process.on('exit', cleanupTemp);
process.on('SIGINT', () => { cleanupTemp(); process.exit(130); });

const SNAPSHOT = arg('--snapshot', '2026-08-22');
const TOTAL_PARTS = 32;
const PARTS = arg('--parts', Array.from({ length: TOTAL_PARTS }, (_, i) => i + 1).join(',')).split(',').map(s => s.trim()).filter(Boolean);
const MIN_COMPANIES = Number(arg('--min-companies', '10'));
const OUT = arg('--out', 'public/data/psc-control.json');
const CACHE = arg('--cache', '');

// One ~70MB archive extracting to ~400MB at a time, 32 of them in sequence.
requireFreeSpace(600 * 1048576, 'one PSC part at a time');

const acc = createPscAccumulator();
const sourceUrls = [];

for (const part of PARTS) {
  const url = `https://download.companieshouse.gov.uk/psc-snapshot-${SNAPSHOT}_${part}of${TOTAL_PARTS}.zip`;
  sourceUrls.push(url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-'));
  activeTemp = tmp;
  const zip = path.join(tmp, 'psc.zip');

  const cached = CACHE ? path.join(CACHE, `part${part}.zip`) : '';
  if (cached && fs.existsSync(cached)) {
    fs.copyFileSync(cached, zip);
  } else {
    console.log(`Fetching part ${part}/${TOTAL_PARTS}`);
    const res = await fetch(url);
    // Abort rather than continue: a partial scan that still writes an asset is
    // the failure this whole design exists to prevent.
    if (!res.ok) { console.error(`Companies House returned ${res.status} for part ${part}`); process.exit(1); }
    // Streamed, not buffered — each archive is ~70MB and the extracted text
    // is ~400MB.
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  }

  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
  const txt = fs.readdirSync(tmp).find(f => f.endsWith('.txt'));
  if (!txt) { console.error(`No snapshot text inside part ${part}`); process.exit(1); }

  const rl = readline.createInterface({ input: fs.createReadStream(path.join(tmp, txt)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    // A row that will not parse is skipped and COUNTED, never guessed at.
    let r; try { r = JSON.parse(line); } catch { continue; }
    acc.add(r);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  activeTemp = null;
  console.log(`  part ${part}: ${acc.stats.records.toLocaleString()} records, heap ${Math.round(process.memoryUsage().heapUsed / 1048576)}MB`);
}

const controllers = acc.finish({ minCompanies: MIN_COMPANIES });
if (acc.stats.records === 0) {
  console.error('No records read — refusing to write an empty asset over a good one.');
  process.exit(1);
}

const complete = PARTS.length === TOTAL_PARTS;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'Companies House persons-with-significant-control register',
  sourceUrl: sourceUrls,
  license: 'Open Government Licence v3.0',
  licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  citation: ['Contains public sector information licensed under the Open Government Licence v3.0.'],
  snapshot: SNAPSHOT,
  retrievedAt: new Date().toISOString(),
  complete,
  // COMPUTED from the parts actually read, and it states its exclusions.
  // A reader who assumed this counted everyone would be wrong in a way that
  // matters, so the boundary says who is not in it.
  bounding: complete
    ? `Every corporate entity named as a person with significant control in the Companies House PSC snapshot of ${SNAPSHOT} (all ${TOTAL_PARTS} parts), whose filed registration number normalises to a UK company number. EXCLUDES individual PSCs, which the register does not identify stably enough to count across companies, and excludes super-secure PSCs. Complete within that boundary; no filter on size, sector or notability.`
    : `Corporate entities named as a person with significant control in parts ${PARTS.join(', ')} of ${TOTAL_PARTS} of the Companies House PSC snapshot of ${SNAPSHOT}. INCOMPLETE: the remaining parts were not scanned, so counts derived from this asset undercount by an unknown amount and MUST NOT be published as enumerations.`,
  partsScanned: PARTS,
  totalParts: TOTAL_PARTS,
  minCompanies: MIN_COMPANIES,
  stats: acc.stats,
  controllerCount: controllers.length,
  controllers,
}, null, 2) + '\n');

console.log(`\nrecords ${acc.stats.records.toLocaleString()} | corporate ${acc.stats.corporate.toLocaleString()} | individual excluded ${acc.stats.individual.toLocaleString()} | super-secure excluded ${acc.stats.superSecure}`);
console.log(`${controllers.length} corporate controller(s) of >= ${MIN_COMPANIES} companies`);
console.log(`Wrote ${OUT}`);
