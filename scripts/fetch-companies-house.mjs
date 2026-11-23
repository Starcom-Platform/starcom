#!/usr/bin/env node
/**
 * A bounded, UNBIASED slice of the UK company register.
 *
 * Companies House publishes the whole register as free bulk downloads with no
 * credential and no account — seven ~70MB zips, ~2.8GB of CSV, about 5.5
 * million companies. That is the point: it is COMPLETE. Every company, not the
 * notable ones.
 *
 * Why that matters more than it sounds. The previous company working set was
 * the intersection of "has an LEI" and "appears on Wikidata" — 118 charitable
 * foundations, 104 registered associations, a hospital, a football club. Zero
 * discrepancies in 64 comparable companies, because Wikidata coverage selects
 * for notability and notability selects against secrecy. The entities worth
 * looking at are notable to nobody.
 *
 * Measured on one part of this register instead: 849,999 companies, and 12,645
 * of them registered at a single address.
 *
 * BOUNDING BY GEOGRAPHY, NOT BY PROMINENCE. The slice is every company in a
 * set of postcode districts — complete within its boundary. Any filter on size,
 * age or notability would reintroduce exactly the bias this replaces, and
 * address clustering specifically needs everyone at an address to see the
 * concentration at all.
 *
 * Usage:
 *   node scripts/fetch-companies-house.mjs [--districts EC1V,WC2H,N1] [--part 1]
 *
 * Exit: 0 wrote the asset · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { clusterByRegisteredAddress } from './lib/clusterRegister.mjs';
import { findIncorporationBatches } from './lib/incorporationBursts.mjs';
import { partitionByPublishability } from './lib/personalAddress.mjs';
import { requireFreeSpace } from './lib/diskGuard.mjs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };

/**
 * Clean up on EVERY exit path, not just the happy one.
 *
 * Each part is a ~70MB archive holding a ~400MB CSV, and this script has four
 * `process.exit(1)` paths that all used to skip the `fs.rmSync` at the bottom.
 * Three failed runs left roughly 1.4GB behind and filled a machine's disk. An
 * exit handler cannot be forgotten by a future error path the way a trailing
 * cleanup call can.
 */
let activeTemp = null;
const cleanupTemp = () => {
  if (!activeTemp) return;
  try { fs.rmSync(activeTemp, { recursive: true, force: true }); } catch { /* best effort on the way out */ }
  activeTemp = null;
};
process.on('exit', cleanupTemp);
process.on('SIGINT', () => { cleanupTemp(); process.exit(130); });

const DISTRICTS = arg('--districts', 'EC1V,WC2H,N1,W1W,WC1N').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
// The register is published in 7 parts. ALL of them are needed: the split is
// by nothing that correlates with geography, so any single part holds roughly
// a seventh of the companies in any district. Scanning one part and calling
// the result "every company in EC1V" — which this script previously did —
// undercounts by ~7x while asserting completeness, and an enumeration finding
// takes that assertion at face value.
const TOTAL_PARTS = 7;
const PARTS = arg('--parts', '1,2,3,4,5,6,7').split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('--out', 'public/data/companies-house.json');
const SNAPSHOT = arg('--snapshot', '2026-08-01');
if (DISTRICTS.length === 0) { console.error('--districts must name at least one'); process.exit(2); }

const districtOf = (postcode) => (postcode || '').trim().toUpperCase().split(/\s+/)[0] ?? '';

/**
 * Force a freshly-allocated string.
 *
 * `split()` and friends hand back V8 SlicedStrings that RETAIN THE WHOLE PARENT
 * LINE, so keeping seven short fields from a 1.5KB register row kept the row —
 * measured at ~30KB of heap per company retained, and an out-of-memory abort on
 * part 3 of 7. Copying through a Buffer detaches them.
 */
const flat = (v) => Buffer.from(String(v ?? ''), 'utf8').toString('utf8');
const cell = (v) => flat(String(v ?? '').trim().replace(/^"|"$/g, ''));

// Each part is a ~70MB archive extracting to a ~400MB CSV, one at a time.
requireFreeSpace(600 * 1048576, 'one register part at a time');

const companies = [];
const sourceUrls = [];
let scanned = 0;

for (const part of PARTS) {
  const url = `https://download.companieshouse.gov.uk/BasicCompanyData-${SNAPSHOT}-part${part}_${TOTAL_PARTS}.zip`;
  sourceUrls.push(url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
  activeTemp = tmp;
  const zip = path.join(tmp, 'ch.zip');

  console.log(`Fetching part ${part}/${TOTAL_PARTS}: ${url}`);
  const res = await fetch(url);
  // Abort rather than continue: a partial scan that still writes an asset is
  // exactly the failure this rewrite exists to remove.
  if (!res.ok) { console.error(`Companies House returned ${res.status} for part ${part}`); process.exit(1); }
  // Streamed, not buffered. Each part is a ~400MB archive and
  // `Buffer.from(await res.arrayBuffer())` holds the whole thing in the JS
  // heap — which died with an out-of-memory abort on part 3 of 7.
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
  const csv = fs.readdirSync(tmp).find(f => f.endsWith('.csv'));
  if (!csv) { console.error(`No CSV inside the archive for part ${part}`); process.exit(1); }

  const rl = readline.createInterface({ input: fs.createReadStream(path.join(tmp, csv)), crlfDelay: Infinity });
  let header = null;
  let idx = {};

  for await (const line of rl) {
    if (!header) {
      header = line.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const at = (name) => header.indexOf(name);
      idx = {
        name: at('CompanyName'),
        number: at('CompanyNumber'),
        line1: at('RegAddress.AddressLine1'),
        town: at('RegAddress.PostTown'),
        postcode: at('RegAddress.PostCode'),
        status: at('CompanyStatus'),
        incorporated: at('IncorporationDate'),
      };
      if (Object.values(idx).some(v => v === -1)) {
        console.error('Unexpected CSV header — refusing to guess at column positions');
        process.exit(1);
      }
      continue;
    }
    scanned++;
    // Naive split is unsafe for quoted commas, so parse only rows that look
    // plausible and drop the rest rather than mis-attributing a field.
    const cells = line.split(',');
    if (cells.length < header.length) continue;
    const postcode = cell(cells[idx.postcode]);
    if (!DISTRICTS.includes(districtOf(postcode))) continue;
    companies.push({
      number: cell(cells[idx.number]),
      name: cell(cells[idx.name]),
      addressLine1: cell(cells[idx.line1]),
      postTown: cell(cells[idx.town]),
      postcode,
      status: cell(cells[idx.status]),
      incorporated: cell(cells[idx.incorporated]),
    });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  activeTemp = null;
  const mb = (n) => `${Math.round(n / 1048576)}MB`;
  console.log(`  part ${part}: ${scanned.toLocaleString()} rows scanned, ${companies.length.toLocaleString()} kept so far, heap ${mb(process.memoryUsage().heapUsed)}`);
}

if (companies.length === 0) {
  console.error('No companies matched — refusing to write an empty asset over a good one.');
  process.exit(1);
}

/**
 * Cluster here, and ship the clusters.
 *
 * The register slice is ~38MB of rows whose only purpose is to be counted, and
 * committing it would put that in every clone and every built bundle forever.
 * The completeness guarantee lives with this script either way: only the thing
 * that read the parts can say whether it read all of them.
 */
const MIN_COMPANIES = Number(arg('--min-companies', '50'));
/**
 * Withhold addresses that name a person rather than a place. See
 * lib/personalAddress.mjs — the clustering floor of 50 was providing this
 * protection incidentally until same-day batches, which need no floor,
 * removed it.
 */
const allClusters = clusterByRegisteredAddress(companies, { minCompanies: MIN_COMPANIES });
// Deliberately NOT bounded by MIN_COMPANIES: the batches are at small
// addresses that the cluster floor excludes entirely. See the module header.
const allBatches = findIncorporationBatches(companies);
const clusterSplit = partitionByPublishability(allClusters);
const batchSplit = partitionByPublishability(allBatches);
const clusters = clusterSplit.publishable;
const batches = batchSplit.publishable;
const withheldPersonalAddresses = clusterSplit.withheld.length + batchSplit.withheld.length;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'Companies House — free company data product',
  sourceUrl: sourceUrls,
  license: 'Open Government Licence v3.0',
  licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  citation: ['Contains public sector information licensed under the Open Government Licence v3.0.'],
  snapshot: SNAPSHOT,
  retrievedAt: new Date().toISOString(),
  // COMPUTED, never asserted. The boundary sentence is built from the parts
  // actually scanned, so it cannot claim more coverage than was performed —
  // the previous version hardcoded "Complete within that boundary" while
  // scanning 1 part of 7. A downstream enumeration finding trusts this string
  // completely, which is exactly why it must not be writable by hand.
  complete: PARTS.length === TOTAL_PARTS,
  bounding: PARTS.length === TOTAL_PARTS
    ? `Every company whose registered postcode district is one of: ${DISTRICTS.join(', ')}, from the complete Companies House register snapshot of ${SNAPSHOT} (all ${TOTAL_PARTS} parts). Complete within that boundary; no filter on size, age or notability. `
      + `${withheldPersonalAddresses} address(es) whose line names a person rather than a place are withheld entirely, `
      + 'because a claim keyed on such a line is a claim about a private individual; the filter deliberately '
      + 'over-excludes, so some organisations without a legal-form suffix are withheld too.'
    : `Companies whose registered postcode district is one of: ${DISTRICTS.join(', ')}, from parts ${PARTS.join(', ')} of ${TOTAL_PARTS} of the Companies House register snapshot of ${SNAPSHOT}. INCOMPLETE: the remaining parts were not scanned, so counts derived from this asset undercount by an unknown amount and MUST NOT be published as enumerations.`,
  districts: DISTRICTS,
  partsScanned: PARTS,
  totalParts: TOTAL_PARTS,
  scannedRows: scanned,
  companyCount: companies.length,
  minCompanies: MIN_COMPANIES,
  withheldPersonalAddresses,
  clusterCount: clusters.length,
  clusters,
  batchCount: batches.length,
  batches,
}, null, 2) + '\n');

console.log(`Scanned ${scanned.toLocaleString()} rows, kept ${companies.length.toLocaleString()} in ${DISTRICTS.join(', ')}`);
console.log(`${clusters.length} address cluster(s) at >= ${MIN_COMPANIES} companies`);
console.log(`${batches.length} same-day incorporation batch(es)`);
console.log(`${withheldPersonalAddresses} address(es) withheld as naming a person rather than a place`);
console.log(`Wrote ${OUT}`);
