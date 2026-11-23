#!/usr/bin/env node
/**
 * Build the Norwegian register asset from Enhetsregisteret.
 *
 * WHY NORWAY AND NOT GERMANY. The plan's second jurisdiction was Germany via
 * OffeneRegister — "open, complete, no credential". Two of those still hold and
 * the important one does not: the dump is dated 5 February 2019, and the
 * download page states no date at all. Germany has no official bulk open data;
 * the Handelsregister is 150 separate district-court databases and most filings
 * are scanned PDFs. A seven-year-old snapshot cannot serve the purpose the
 * second jurisdiction exists for — measuring agreement against 2026 UK data —
 * because every discrepancy would be elapsed time wearing the costume of a
 * source disagreement.
 *
 * Brønnøysundregistrene publishes the whole register nightly under NLOD, with
 * no credential, and the server states the snapshot instant in `last-modified`.
 * That last point is not a convenience: an enumeration's weight is entirely a
 * function of its stated boundary and its age, so a source that will not say
 * when it was taken cannot be published as an enumeration at all.
 *
 * Unlike the UK asset this is NATIONAL and unbounded by geography — every unit
 * in the register, no postcode slice.
 *
 * Usage:
 *   node scripts/fetch-brreg.mjs
 *
 * Exit: 0 wrote the asset · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { requireFreeSpace } from './lib/diskGuard.mjs';
import { archiveDir, teeToArchive, openArchived } from './lib/snapshotArchive.mjs';
import { clusterByRegisteredAddress } from './lib/clusterRegister.mjs';
import { findIncorporationBatches } from './lib/incorporationBursts.mjs';
import { partitionByPublishability } from './lib/personalAddress.mjs';
import { streamJsonArray } from './lib/jsonArrayStream.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };

const URL_ = 'https://data.brreg.no/enhetsregisteret/api/enheter/lastned';
const ACCEPT = 'application/vnd.brreg.enhetsregisteret.enhet.v2+gzip';
const OUT = arg('--out', 'public/data/brreg.json');
const MIN_COMPANIES = Number(arg('--min-companies', '50'));
const ARCHIVE = archiveDir(arg('--archive', ''));
/**
 * Read an archived snapshot BY DATE, never "the latest cached".
 *
 * Brønnøysundregistrene serves one file at one undated URL, regenerated
 * nightly, so a claim published from it becomes unverifiable the next morning
 * unless the bytes were kept. Naming the date is required precisely so a
 * cached file can never stand in for a current one — completeness and snapshot
 * age are the whole basis of an enumeration's weight.
 */
const FROM_ARCHIVE = arg('--from-archive', '');
// One place for the archived extension. The write path used '.json.gz' and the
// read path defaulted to '.gz', which fails silently in the worst way: the
// archive is present and correct, and the reader reports no snapshot for that
// date.
const ARCHIVE_EXT = '.json.gz';
const ARCHIVE_DATASET = 'brreg-enheter';

/**
 * Founding dates that are really the register's own load dates.
 *
 * Switching from registreringsdato to stiftelsesdato removed most of the
 * artifact but not all of it: 1995-02-20 is the SINGLE MOST COMMON founding
 * date in the whole register, 1,297 units, on the very day Enhetsregisteret
 * was populated (47,117 units carry it as their register-entry date). Real
 * foundings do not cluster on a register's launch day. The value was
 * backfilled from the migration for entities whose true founding date was not
 * known.
 *
 * Units carrying one are treated as having NO founding date: they still count
 * toward their address's total but toward no day, so a batch share is
 * understated rather than invented. Two batches disappear — both farm relief
 * cooperatives dated 1995-02-20 — and both would have been false claims that
 * companies were founded together on a day they were merely migrated.
 */
const REGISTER_LOAD_DATES = new Set(['1995-02-19', '1995-02-20']);


// Only the finished asset is written — about 1MB — but the run holds the
// accumulated units in memory, so state the cost and stop if it will not fit.
requireFreeSpace(64 * 1048576, 'the Norwegian register asset', path.dirname(OUT));

/**
 * Parse the snapshot instant out of Last-Modified.
 *
 * Brønnøysundregistrene does not send RFC 7231. It sends Java's
 * `Date.toString()` — "Sat Aug 22 04:27:09 CEST 2026" — which `Date.parse`
 * rejects outright, returning NaN.
 *
 * The zone is looked up rather than assumed. Defaulting an unknown zone to UTC
 * would be silently wrong by an hour or two, which does not matter at 04:27
 * and matters completely at 23:30: the snapshot would be dated to the wrong
 * calendar day, and that date is what every claim's boundary sentence states
 * and what its recency is measured from.
 */
const ZONES = { GMT: 0, UTC: 0, UT: 0, Z: 0, CET: 60, CEST: 120 };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseLastModified(header) {
  const rfc = Date.parse(header);
  if (!Number.isNaN(rfc)) return new Date(rfc).toISOString();

  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([A-Z]{1,4}) (\d{4})$/.exec(String(header).trim());
  if (!m) return null;
  const [, mon, day, hh, mm, ss, zone, year] = m;
  const monthIndex = MONTHS.indexOf(mon);
  const offsetMinutes = ZONES[zone];
  if (monthIndex < 0 || offsetMinutes === undefined) return null;

  return new Date(Date.UTC(+year, monthIndex, +day, +hh, +mm, +ss) - offsetMinutes * 60_000).toISOString();
}

let snapshotInstant = arg('--snapshot', '');
let archived = Promise.resolve(null);

// A truncated archive cannot reach its gzip trailer, so this refuses rather
// than yielding a register that looks complete and is not. It happened: a
// download stopped at 57% and an ad-hoc scan reported 676,227 units as though
// that were the whole register.
const onGunzipError = (err) => {
  console.error(`Could not decompress the register: ${err.message}`);
  console.error('A truncated archive yields a register that looks complete and is not.');
  process.exit(1);
};

/**
 * Nothing is written to disk. Not the archive, not the 1.5GB decompressed
 * register — the response is piped through gunzip straight into the parser.
 *
 * The first version wrote both, which cost about 1.7GB per run and left it
 * behind whenever the run failed, because the error paths call process.exit
 * before the cleanup. It filled a machine's disk. Streaming removes the
 * failure mode rather than tidying up after it.
 */
async function* registerUnits() {
  if (FROM_ARCHIVE) {
    const found = openArchived(ARCHIVE, ARCHIVE_DATASET, FROM_ARCHIVE, ARCHIVE_EXT);
    if (!found) {
      console.error(`No archived brreg snapshot for ${FROM_ARCHIVE} in ${ARCHIVE || '(no archive configured)'}.`);
      process.exit(2);
    }
    snapshotInstant = `${FROM_ARCHIVE}T00:00:00.000Z`;
    /**
     * Verification is explicit rather than a side effect of opening, so a
     * caller cannot read an archived file without asking for it. The size
     * check already happened in openArchived; this is the digest.
     *
     * Refused with a sentence rather than a stack trace: "the archived bytes
     * are not the bytes the manifest describes" is an operator problem, and a
     * raw unhandled rejection buries that under a trace of this script.
     */
    try {
      await found.verify();
    } catch (err) {
      console.error(`  ${err.message}`);
      console.error('  Re-fetch the snapshot, or delete the manifest if you know the file is right.');
      process.exit(1);
    }
    console.log(`Reading archived snapshot ${FROM_ARCHIVE} (${found.manifest.sha256.slice(0, 16)}…), verified against its manifest`);
    // Recorded whichever path produced the bytes: an asset that cannot say
    // where its source is kept has the same problem as one with no boundary.
    archived = Promise.resolve(found.manifest);
    const gz = zlib.createGunzip();
    gz.on('error', onGunzipError);
    yield* streamJsonArray(fs.createReadStream(found.path).pipe(gz));
    return;
  }

  console.log(`Fetching ${URL_}`);
  const res = await fetch(URL_, { headers: { Accept: ACCEPT } });
  if (!res.ok) { console.error(`Brønnøysundregistrene returned ${res.status}`); process.exit(1); }

  // The SERVER's timestamp, not ours. When we chose to download says nothing
  // about when the register was taken, and an enumeration ages from the latter.
  const lastModified = res.headers.get('last-modified');
  if (!snapshotInstant) {
    const parsed = lastModified ? parseLastModified(lastModified) : null;
    if (!parsed) {
      console.error(lastModified
        ? `Could not read the snapshot instant from Last-Modified: ${JSON.stringify(lastModified)}`
        : 'No Last-Modified header.');
      console.error('Refusing to guess when this register was taken — pass --snapshot YYYY-MM-DD if you know it.');
      process.exit(1);
    }
    snapshotInstant = parsed;
  }

  const gunzip = zlib.createGunzip();
  gunzip.on('error', onGunzipError);

  // Archived and parsed in ONE pass. Reading it twice would mean holding it in
  // memory or writing it to disk first, and writing it to disk first is what
  // filled a machine.
  const snapshotDay = snapshotInstant.slice(0, 10);
  const { stream, written } = teeToArchive(Readable.fromWeb(res.body), {
    dir: ARCHIVE, dataset: ARCHIVE_DATASET, snapshot: snapshotDay, ext: ARCHIVE_EXT, url: URL_,
  });
  archived = written;
  yield* streamJsonArray(stream.pipe(gunzip));
}


const companies = [];
const stats = { units: 0, noBusinessAddress: 0, foreignAddress: 0, kept: 0, withFoundingDate: 0, foundingDateFromRegisterLoad: 0 };

for await (const e of registerUnits()) {
  stats.units++;
  const fa = e.forretningsadresse;
  const line1 = fa?.adresse?.[0];

  /**
   * Country FIRST, then completeness.
   *
   * Postcode namespaces are national: folding a Norwegian postnummer together
   * with a foreign postal code of the same digits merges two unrelated
   * addresses into one count. So foreign addresses are excluded and COUNTED.
   *
   * The order matters and got this wrong once. Checking completeness first
   * reported `foreignAddress: 0` while 44,038 units have a non-Norwegian
   * business address — they lack a Norwegian-format postnummer, so they were
   * filed under "no business address" and the published boundary sentence
   * described the exclusions incorrectly.
   */
  if (fa && (fa.landkode ?? '').toUpperCase() !== 'NO') { stats.foreignAddress++; continue; }
  if (!line1?.trim() || !fa?.postnummer?.trim()) { stats.noBusinessAddress++; continue; }

  const dead = Boolean(e.konkurs || e.underAvvikling || e.underTvangsavviklingEllerTvangsopplosning || e.slettedato);
  const stiftet = String(e.stiftelsesdato ?? '').trim();
  const foundingDate = REGISTER_LOAD_DATES.has(stiftet) ? '' : stiftet;
  if (stiftet && !foundingDate) stats.foundingDateFromRegisterLoad++;
  companies.push({
    number: String(e.organisasjonsnummer ?? '').trim(),
    name: String(e.navn ?? '').trim(),
    addressLine1: String(line1).trim(),
    postTown: String(fa.poststed ?? '').trim(),
    postcode: String(fa.postnummer).trim(),
    status: dead ? 'Dissolved' : 'Active',
    /**
     * `stiftelsesdato` — the founding date — and NOT
     * `registreringsdatoEnhetsregisteret`.
     *
     * The latter is present on 100% of units and looks like the obvious
     * analogue of Companies House's IncorporationDate. It is not: it records
     * when an entity entered THIS register, so 47,117 units share 1995-02-20
     * and 26,680 share 1995-02-19 — the days Enhetsregisteret itself was
     * populated. Using it published claims that a hundred companies were
     * "incorporated on 1995-02-19" when they were founded decades earlier and
     * merely migrated that day. The first record in the file says it plainly:
     * founded 1977-06-15, registered 1995-02-19.
     *
     * `stiftelsesdato` is present on 57.7% of units. The rest contribute to an
     * address's total but to no day, so a batch's share is understated rather
     * than inflated — the safe direction, and stated in the boundary.
     */
    incorporated: foundingDate,
  });
  stats.kept++;
  if (foundingDate) stats.withFoundingDate++;
}
if (stats.kept === 0) {
  console.error('No units kept — refusing to write an empty asset over a good one.');
  process.exit(1);
}

/**
 * Derived AFTER the stream, not before it.
 *
 * `snapshotInstant` is only known once the response headers arrive, so
 * computing this at module load produced an empty string — and an asset whose
 * boundary sentence named no date at all, with recency ageing from nothing.
 * The archive filename was right because it was computed inside the stream,
 * which is exactly why the mismatch was easy to miss.
 */
const snapshotDate = snapshotInstant.slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
  console.error(`Refusing to write an asset with no usable snapshot date (got ${JSON.stringify(snapshotDate)}).`);
  process.exit(1);
}

// Wait for the archive write to finish before describing it in the asset.
const archivedManifest = await archived;
if (archivedManifest) {
  console.log(`Archived ${(archivedManifest.bytes / 1048576).toFixed(0)}MB as ${archivedManifest.file} (sha256 ${archivedManifest.sha256.slice(0, 16)}…)`);
} else if (!FROM_ARCHIVE) {
  console.log('No archive configured (--archive or STARCOM_ARCHIVE); the exact snapshot bytes are NOT being kept.');
}

/**
 * Withhold addresses that name a person rather than a place.
 *
 * A register records plenty of registered offices as "C/O <someone>", and in
 * Norway that someone is often a private individual whose home is the address
 * for a few small companies. A claim keyed on that line is a claim about a
 * PERSON published as a place — see lib/personalAddress.mjs for how the
 * address-clustering floor of 50 was quietly providing this protection until
 * same-day batches, which need no floor, removed it.
 */
const allClusters = clusterByRegisteredAddress(companies, { minCompanies: MIN_COMPANIES });
const allBatches = findIncorporationBatches(companies);
const clusterSplit = partitionByPublishability(allClusters);
const batchSplit = partitionByPublishability(allBatches);
const clusters = clusterSplit.publishable;
const batches = batchSplit.publishable;
const withheldPersonalAddresses = clusterSplit.withheld.length + batchSplit.withheld.length;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'Brønnøysundregistrene — Enhetsregisteret',
  sourceUrl: [URL_],
  license: 'Norsk lisens for offentlige data (NLOD)',
  licenseUrl: 'https://data.norge.no/nlod/no/2.0',
  citation: ['Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene.'],
  snapshot: snapshotDate,
  snapshotInstant,
  // Where the exact bytes behind this asset can be found, when they were kept.
  // The upstream URL is undated and regenerated nightly, so without this the
  // source of a published count is gone by the next morning.
  archivedSnapshot: archivedManifest
    ? { file: archivedManifest.file, sha256: archivedManifest.sha256, bytes: archivedManifest.bytes }
    : null,
  retrievedAt: new Date().toISOString(),
  // The whole register, so this is complete by construction rather than within
  // a geographic slice. The exclusions are stated because a reader who assumed
  // the count covered every unit would read every number slightly wrong.
  complete: true,
  addressTerm: 'registered business address',
  bounding: `Every unit in the Norwegian Enhetsregisteret with a registered business address in Norway, from the complete register snapshot of ${snapshotDate}. `
    + `${stats.units.toLocaleString()} units in the register; ${stats.noBusinessAddress.toLocaleString()} have no registered business address and `
    + `${stats.foreignAddress.toLocaleString()} have one outside Norway, so ${stats.kept.toLocaleString()} are counted. `
    + 'Complete within that boundary; no filter on size, age, sector or notability. '
    + `Same-day founding batches use stiftelsesdato (the founding date), recorded for ${stats.withFoundingDate.toLocaleString()} of those counted; `
    + 'units without one contribute to an address total but to no day, so a batch share is understated rather than inflated. '
    + 'The register-entry date is deliberately NOT used: it records migration into Enhetsregisteret, not founding. '
    + `${withheldPersonalAddresses} address(es) whose line names a person rather than a place are withheld entirely, `
    + 'because a claim keyed on such a line is a claim about a private individual; the filter deliberately '
    + 'over-excludes, so some organisations without a legal-form suffix are withheld too. '
    + `A further ${stats.foundingDateFromRegisterLoad.toLocaleString()} units carry a founding date equal to one of the register's own bulk-load days `
    + '(1995-02-19, 1995-02-20) and are treated as having none, because that value was backfilled from the migration rather than observed.',
  minCompanies: MIN_COMPANIES,
  withheldPersonalAddresses,
  stats,
  companyCount: stats.kept,
  clusterCount: clusters.length,
  clusters,
  batchCount: batches.length,
  batches,
}, null, 2) + '\n');

console.log(`\nunits ${stats.units.toLocaleString()} | no business address ${stats.noBusinessAddress.toLocaleString()} | foreign address ${stats.foreignAddress.toLocaleString()} | counted ${stats.kept.toLocaleString()}`);
console.log(`${clusters.length} address cluster(s) at >= ${MIN_COMPANIES}; ${batches.length} same-day batch(es)`);
console.log(`${withheldPersonalAddresses} address(es) withheld as naming a person rather than a place`);
console.log(`Snapshot ${snapshotDate} (from the server, not from us)`);
console.log(`Wrote ${OUT}`);
