#!/usr/bin/env node
/**
 * ITEM 8 — agreement and discrepancy on an UNFILTERED population.
 *
 * The earlier measurement compared 64 companies and found zero discrepancies.
 * Its GLEIF seed came from Wikidata items carrying both an LEI and a
 * headquarters, so it selected for notability, and notable entities keep tidy
 * records. This joins the ENTIRE Global LEI Index — 3.4M records — to a
 * complete national register, with no filter on either side.
 *
 * WHAT AGREEMENT HERE IS WORTH, WHICH IS LESS THAN IT LOOKS.
 *
 * GLEIF is not an independent observer of a national register. To issue an
 * LEI, an LOU validates the entity against its home register and records the
 * registration number it found there. So when GLEIF and Enhetsregisteret agree
 * on an address, that is substantially ECHO — one source restating another —
 * not two observers independently arriving at the same answer. Counting it as
 * corroboration would manufacture confidence out of a copy, which is the exact
 * failure the derivation and relay-discount rules exist to prevent.
 *
 * So the informative number here is NOT the agreement rate. It is the
 * DISAGREEMENT rate, and how it moves with the LEI record's registration
 * status: a LAPSED record has stopped being revalidated, so it should drift.
 * If it does not, the join is not measuring what it claims to.
 *
 * Comparison is on POSTCODE ONLY, exactly. Street lines are free text in both
 * sources and comparing them means fuzzy matching, which would report
 * differences of punctuation as disagreements about the world.
 *
 * Usage:
 *   node scripts/measure-register-agreement.mjs \
 *     --gleif  /Volumes/.../gleif-lei2/2026-08-22.csv.zip \
 *     --brreg  /Volumes/.../brreg-enheter/2026-08-22.json.gz
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { streamJsonArray } from './lib/jsonArrayStream.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const GLEIF = arg('--gleif', '');
const BRREG = arg('--brreg', '');
const OUT = arg('--out', '');
if (!GLEIF || !BRREG) { console.error('Need --gleif <csv.zip> and --brreg <json.gz>'); process.exit(2); }

/**
 * Norway's registration authorities — BOTH of them.
 *
 * The GLEIF RA list gives the Brønnøysund Register Centre two codes,
 * RA000472 and RA000473, for the Enhetsregisteret and Foretaksregisteret. A
 * filter on one silently drops every entity registered under the other, which
 * undercounts the join and would have been invisible: the result is simply a
 * smaller population that still looks complete.
 *
 * RA000971 is Finanstilsynet, a different authority whose identifiers are not
 * organisation numbers, so it is excluded and counted rather than joined.
 */
const RA_NORWAY = new Set(['RA000472', 'RA000473']);
const RA_OTHER_NORWEGIAN = new Set(['RA000971']);

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * A Norwegian organisation number, digits only.
 *
 * GLEIF stores these as filed, and Norwegian convention writes them in three
 * groups of three — "924 329 327" is the same number as "924329327". Joining
 * on the raw strings dropped 53,815 of 64,782 records, or 83% of the
 * population, and the join still LOOKED like it worked: it returned 9,572
 * matches and an agreement rate to two decimal places. Worse, the surviving
 * subset was exactly those whose issuing LOU happened not to use spaces, which
 * is not a random sample of anything.
 *
 * This is a formatting normalisation, not a fuzzy match: an organisation
 * number is nine digits, and the spaces are presentational.
 */
const orgNumber = (v) => String(v ?? '').replace(/\D/g, '');

// ---- 1. The national register, from the archived snapshot -------------------
console.log('Reading the Norwegian register…');
const register = new Map();   // organisasjonsnummer -> { postcode, city, name }
for await (const e of streamJsonArray(fs.createReadStream(BRREG).pipe(zlib.createGunzip()))) {
  const fa = e.forretningsadresse;
  if (!fa?.postnummer) continue;
  register.set(orgNumber(e.organisasjonsnummer), {
    postcode: norm(fa.postnummer),
    city: norm(fa.poststed),
    name: String(e.navn ?? '').trim(),
  });
}
console.log(`  ${register.size.toLocaleString()} units with a business address`);

// ---- 2. The whole LEI index, streamed out of the zip ------------------------
//
// `unzip -p` writes the member to stdout, so the 2GB CSV is never extracted to
// disk. Node has no streaming zip reader and writing it out first is what
// filled a machine once already.
console.log('Streaming the Global LEI Index…');
const unzip = spawn('unzip', ['-p', GLEIF], { stdio: ['ignore', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity });

/** Split one CSV line, honouring quotes. GLEIF quotes any field containing a comma. */
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

let idx = null;
const stats = {
  leiRecords: 0, norwegian: 0, withRegistrationNumber: 0,
  matchedToRegister: 0, unmatched: 0, otherNorwegianAuthority: 0,
  byAuthority: {},
  agree: 0, disagree: 0,
  byStatus: {},
};
const examples = [];

for await (const line of rl) {
  if (!line.trim()) continue;
  const cells = splitCsv(line);

  if (!idx) {
    const header = cells.map((h) => h.trim());
    const at = (name) => header.indexOf(name);
    idx = {
      lei: at('LEI'),
      name: at('Entity.LegalName'),
      ra: at('Entity.RegistrationAuthority.RegistrationAuthorityID'),
      raId: at('Entity.RegistrationAuthority.RegistrationAuthorityEntityID'),
      postcode: at('Entity.LegalAddress.PostalCode'),
      city: at('Entity.LegalAddress.City'),
      country: at('Entity.LegalAddress.Country'),
      status: at('Registration.RegistrationStatus'),
      entityStatus: at('Entity.EntityStatus'),
    };
    // Refuse to guess at column positions, exactly as the register fetchers do.
    const missing = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
    if (missing.length) {
      console.error(`Unexpected GLEIF CSV header — missing: ${missing.join(', ')}`);
      process.exit(1);
    }
    continue;
  }

  stats.leiRecords++;
  const ra = cells[idx.ra]?.trim();
  if (RA_OTHER_NORWEGIAN.has(ra)) { stats.otherNorwegianAuthority++; continue; }
  if (!RA_NORWAY.has(ra)) continue;
  stats.norwegian++;
  stats.byAuthority[ra] = (stats.byAuthority[ra] ?? 0) + 1;

  const regNumber = orgNumber(cells[idx.raId]);
  if (!regNumber) continue;
  stats.withRegistrationNumber++;

  const found = register.get(regNumber);
  if (!found) { stats.unmatched++; continue; }
  stats.matchedToRegister++;

  const status = cells[idx.status]?.trim() || 'UNKNOWN';
  const bucket = stats.byStatus[status] ??= { matched: 0, agree: 0, disagree: 0 };
  bucket.matched++;

  const gleifPostcode = norm(cells[idx.postcode]);
  if (!gleifPostcode) continue;

  if (gleifPostcode === found.postcode) { stats.agree++; bucket.agree++; }
  else {
    stats.disagree++; bucket.disagree++;
    if (examples.length < 12) {
      examples.push({
        lei: cells[idx.lei], regNumber, status,
        gleif: `${gleifPostcode} ${norm(cells[idx.city])}`,
        register: `${found.postcode} ${found.city}`,
        name: found.name.slice(0, 44),
      });
    }
  }
}

const pct = (a, b) => (b ? `${(a / b * 100).toFixed(2)}%` : 'n/a');
console.log(`\nLEI records scanned      ${stats.leiRecords.toLocaleString()}`);
console.log(`Norwegian (Brønnøysund)  ${stats.norwegian.toLocaleString()}  ${JSON.stringify(stats.byAuthority)}`);
console.log(`  other NO authority     ${stats.otherNorwegianAuthority.toLocaleString()} (excluded — not organisation numbers)`);
console.log(`  with a reg. number     ${stats.withRegistrationNumber.toLocaleString()}`);
console.log(`  matched in register    ${stats.matchedToRegister.toLocaleString()}  (unmatched ${stats.unmatched.toLocaleString()})`);
console.log(`\nPostcode agreement       ${stats.agree.toLocaleString()} (${pct(stats.agree, stats.agree + stats.disagree)})`);
console.log(`Postcode disagreement    ${stats.disagree.toLocaleString()} (${pct(stats.disagree, stats.agree + stats.disagree)})`);
console.log('\nby LEI registration status:');
for (const [k, v] of Object.entries(stats.byStatus).sort((a, b) => b[1].matched - a[1].matched)) {
  const cmp = v.agree + v.disagree;
  console.log(`  ${k.padEnd(22)} matched ${String(v.matched).padStart(7)}  disagree ${String(v.disagree).padStart(6)}  (${pct(v.disagree, cmp)})`);
}
console.log('\ndisagreements:');
for (const e of examples) {
  console.log(`  ${e.regNumber}  ${e.status.padEnd(10)} GLEIF ${e.gleif.padEnd(22)} register ${e.register.padEnd(22)} ${e.name}`);
}

if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify({ stats, examples }, null, 2) + '\n');
  console.log(`\nWrote ${OUT}`);
}
