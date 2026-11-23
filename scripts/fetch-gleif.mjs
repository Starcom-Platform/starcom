#!/usr/bin/env node
/**
 * Fetch a bounded GLEIF working set into public/data/, seeded from Wikidata.
 *
 * A STATIC ASSET, the same shape as the UCDP dataset already here, and for the
 * same reasons: the app takes no runtime dependency on a third party, the data
 * is reviewable in a diff, and a fork gets exactly what we have without needing
 * a credential or an account. Both sources are CC0 / public domain.
 *
 * Seeded from Wikidata rather than crawled, because the only GLEIF records that
 * can ever be corroborated are the ones another registry also describes. That
 * intersection is ~48,000 entities out of GLEIF's 3.4 million, so seeding turns
 * an impossible crawl into a bounded fetch — and it never downloads records
 * nothing could check.
 *
 * Usage:
 *   node scripts/fetch-gleif.mjs [--limit N] [--out public/data/gleif.json]
 *
 * Exit: 0 wrote the asset · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { archiveDir, openArchived } from './lib/snapshotArchive.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const LIMIT = Number(arg('--limit', '500'));
const OUT = arg('--out', 'public/data/gleif.json');
const ARCHIVE = archiveDir(arg('--archive', ''));
/**
 * Read the records from an archived golden copy instead of the live API.
 *
 * The live endpoint is undated and returns whatever GLEIF holds right now, so
 * nothing could confirm the committed records reflect GLEIF at the moment they
 * were read — the freshness guard reports that asset as UNREPRODUCIBLE, and it
 * is right. A dated golden copy fixes it: the bytes are archived with a
 * manifest, and anyone with the same file gets the same records.
 *
 * This does NOT make the SELECTION reproducible. The seed is still a live
 * Wikidata query, so which LEIs were chosen still depends on when it ran. That
 * is a scope problem, not a provenance one, and it is what item 35 replaces.
 */
const FROM_ARCHIVE = arg('--from-archive', '');
if (!Number.isFinite(LIMIT) || LIMIT <= 0) {
  console.error('--limit must be a positive number');
  process.exit(2);
}

const UA = 'starcom-app/0.1 (https://github.com/Arch-Angel-Agency-LLC/starcom-app)';

/** LEIs that Wikidata also describes — the only ones worth fetching. */
async function seedLeis(limit) {
  const query = `SELECT DISTINCT ?lei WHERE { ?c wdt:P1278 ?lei . ?c wdt:P159 ?hq } LIMIT ${limit}`;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikidata returned ${res.status}`);
  const body = await res.json();
  // Uppercased and de-duplicated: LEIs are case-insensitive in practice and a
  // duplicate would fetch the same record twice, which is harmless here but
  // would inflate the counts this script reports.
  return [...new Set(body.results.bindings.map((b) => b.lei.value.trim().toUpperCase()))];
}

/** GLEIF accepts a comma-separated LEI filter; verified against the live API. */
const BATCH = 50;

async function fetchBatch(leis) {
  const url = `https://api.gleif.org/api/v1/lei-records?filter%5Blei%5D=${leis.join(',')}&page%5Bsize%5D=${BATCH}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GLEIF returned ${res.status}`);
  return (await res.json()).data ?? [];
}

/** Split one CSV line, honouring quotes. GLEIF quotes any field with a comma. */
function splitCsv(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Pull the seeded LEIs out of an archived golden copy.
 *
 * Streamed through `unzip -p`, so the 2GB CSV is never extracted to disk. The
 * record shape produced here is the one the adapter already consumes, so the
 * asset is a drop-in whichever source filled it.
 */
async function recordsFromArchive(wanted, file) {
  const want = new Set(wanted);
  const found = [];
  const unzip = spawn('unzip', ['-p', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let idx = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (!idx) {
      const h = c.map((x) => x.trim());
      const at = (n) => h.indexOf(n);
      idx = {
        lei: at('LEI'), name: at('Entity.LegalName'),
        city: at('Entity.LegalAddress.City'), region: at('Entity.LegalAddress.Region'),
        country: at('Entity.LegalAddress.Country'), postal: at('Entity.LegalAddress.PostalCode'),
        entityStatus: at('Entity.EntityStatus'),
        regStatus: at('Registration.RegistrationStatus'), updated: at('Registration.LastUpdateDate'),
        // Carried because the next steps need them, not because the adapter
        // reads them today. `registeredAs` plus the authority id is the join
        // to a national register — the pair that gap 29 turns on and that item
        // 36 will need. Fetching them now avoids re-reading a 500MB archive
        // later to add two columns.
        registeredAs: at('Entity.RegistrationAuthority.RegistrationAuthorityEntityID'),
        registrationAuthority: at('Entity.RegistrationAuthority.RegistrationAuthorityID'),
        jurisdiction: at('Entity.LegalJurisdiction'),
        category: at('Entity.EntityCategory'),
      };
      // Refuse to guess at column positions, as every other fetcher here does.
      const missingCols = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
      if (missingCols.length) {
        console.error(`Unexpected GLEIF CSV header — missing: ${missingCols.join(', ')}`);
        process.exit(1);
      }
      continue;
    }
    const lei = c[idx.lei]?.trim().toUpperCase();
    if (!lei || !want.has(lei)) continue;
    found.push({
      id: lei,
      attributes: {
        lei,
        entity: {
          legalName: { name: c[idx.name]?.trim() },
          legalAddress: {
            city: c[idx.city]?.trim() || null,
            region: c[idx.region]?.trim() || null,
            country: c[idx.country]?.trim() || null,
            postalCode: c[idx.postal]?.trim() || null,
          },
          status: c[idx.entityStatus]?.trim(),
          registeredAs: c[idx.registeredAs]?.trim() || null,
          registrationAuthority: c[idx.registrationAuthority]?.trim() || null,
          jurisdiction: c[idx.jurisdiction]?.trim() || null,
          category: c[idx.category]?.trim() || null,
        },
        registration: {
          lastUpdateDate: c[idx.updated]?.trim(),
          status: c[idx.regStatus]?.trim(),
        },
      },
    });
  }
  return found;
}

const leis = await seedLeis(LIMIT);
console.log(`Seed: ${leis.length} LEIs that Wikidata also describes`);

let records = [];
let archivedManifest = null;

if (FROM_ARCHIVE) {
  const found = openArchived(ARCHIVE, 'gleif-lei2', FROM_ARCHIVE, '.csv.zip');
  if (!found) {
    console.error(`No archived GLEIF golden copy for ${FROM_ARCHIVE} in ${ARCHIVE || '(no archive configured)'}.`);
    process.exit(2);
  }
  try {
    await found.verify();
  } catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
  }
  console.log(`Reading archived golden copy ${FROM_ARCHIVE} (${found.manifest.sha256.slice(0, 16)}…), verified`);
  records = await recordsFromArchive(leis, found.path);
  archivedManifest = found.manifest;
  console.log(`  matched ${records.length}/${leis.length} seeded LEIs`);
}

for (let i = 0; !FROM_ARCHIVE && i < leis.length; i += BATCH) {
  const batch = leis.slice(i, i + BATCH);
  try {
    const got = await fetchBatch(batch);
    records.push(...got);
    process.stdout.write(`\r  fetched ${records.length}/${leis.length}`);
  } catch (e) {
    // One failed batch is not a failed run. Reported, not swallowed: a partial
    // asset that looks complete is the failure this whole codebase keeps
    // fixing.
    console.error(`\n  batch ${i / BATCH} failed: ${e.message}`);
  }
  // Deliberate pacing. These are free, uncredentialed public services and the
  // project's own OSEE claim depends on them staying usable by everyone.
  await new Promise((r) => setTimeout(r, 250));
}
console.log('');

if (records.length === 0) {
  console.error('No records fetched — refusing to write an empty asset over a good one.');
  process.exit(1);
}

const missing = leis.length - records.length;
const asset = {
  source: 'GLEIF Global LEI Index',
  sourceUrl: archivedManifest?.url || 'https://api.gleif.org/api/v1/lei-records',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://www.gleif.org/en/meta/lei-data-terms-of-use',
  seededFrom: 'Wikidata items carrying both P1278 (LEI) and P159 (headquarters)',
  citation: ['GLEIF Global LEI Index, https://www.gleif.org/ — CC0 1.0'],
  retrievedAt: new Date().toISOString(),
  ...(FROM_ARCHIVE ? { snapshot: FROM_ARCHIVE } : {}),
  /**
   * Where the bytes behind these records are kept.
   *
   * Present only when read from a dated golden copy. Read from the live API
   * this is null, and the freshness guard reports the asset as
   * UNREPRODUCIBLE — correctly, because nothing can confirm the records
   * reflect GLEIF at the moment they were read.
   */
  archivedSnapshot: archivedManifest
    ? { file: archivedManifest.file, sha256: archivedManifest.sha256, bytes: archivedManifest.bytes }
    : null,
  /**
   * The RECORDS are reproducible from the archived snapshot. The SELECTION is
   * not: the seed is a live Wikidata query, so which LEIs appear here still
   * depends on when it ran. Stated rather than glossed — the two are different
   * guarantees and only one of them holds.
   */
  selectionReproducible: false,
  seedCount: leis.length,
  recordCount: records.length,
  // Stated in the asset itself, so a reader of the file knows the working set
  // is a sample rather than assuming it is everything.
  notSeenInGleif: missing,
  records,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(asset, null, 2) + '\n');
console.log(`Wrote ${records.length} records to ${OUT}${missing > 0 ? ` (${missing} seed LEIs not found in GLEIF)` : ''}`);
