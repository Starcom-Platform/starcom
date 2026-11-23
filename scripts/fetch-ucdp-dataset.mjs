#!/usr/bin/env node
/**
 * Fetch UCDP conflict data as a static, redistributable asset.
 *
 * WHY THIS EXISTS RATHER THAN AN API CALL
 *
 * UCDP's REST API now requires a per-user access token:
 *
 *   401 "API token required. Add header: x-ucdp-access-token: <your-token>"
 *
 * A credential obtained by one person is exactly the kind of single-operator
 * dependency the OSEE pillar's own test refuses — "could a different,
 * unaffiliated group actually stand up their own instance." With a token, the
 * honest answer is "only if they write to Uppsala and are granted one."
 *
 * The Download Center publishes the same data as CSV under CC BY 4.0, free,
 * with no credential of any kind. So this fetches from there instead, and the
 * result is strictly better along every axis the project cares about:
 *
 *   - Forkable. No key to obtain, no account, no gatekeeper.
 *   - Redistributable. CC BY 4.0, provided the citations below travel with it,
 *     which is why they are embedded in the output rather than left in a README.
 *   - Offline and censorship-resistant. A static file can be pinned to IPFS;
 *     an authenticated endpoint cannot.
 *   - Small. The Candidate Events release is ~1.3 MB against ~39 MB for the
 *     full 1989-2025 GED, and it carries under a month's lag — which is the
 *     part that matters, since corroboration works in a 24-hour window and
 *     conflict events from 1994 will never corroborate anything current.
 *
 * The upstream sends no Access-Control-Allow-Origin, so a browser cannot fetch
 * it directly. That is the other reason this is a build step: the app loads a
 * same-origin asset instead of depending on someone else's CORS policy.
 *
 * Usage:  node scripts/fetch-ucdp-dataset.mjs
 * Output: public/data/ucdp-ged.json
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_URL = 'https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_6.csv';
const DATASET_VERSION = '26.0.6';
const OUT_PATH = path.join(process.cwd(), 'public', 'data', 'ucdp-ged.json');

/**
 * Required attribution. CC BY 4.0 is a licence with an obligation, not a
 * free-for-all, and a project whose whole argument is open intelligence in the
 * public interest does not get to be sloppy about crediting the people who
 * spent forty years collecting the data.
 */
const CITATION = [
  'Shawn Davies, Therése Pettersson, Magnus Öberg, Organized violence 1989–2025, and violent political protests, Journal of Peace Research, 2026. https://doi.org/10.1093/jopres/xjag046',
  'Hegre, Håvard, Mihai Croicu, Kristine Eck, and Stina Högbladh (2020) Introducing the UCDP Candidate Events Dataset. Research & Politics.',
  'UCDP is part of and funded by DEMSCORE, national research infrastructure grant 2021-00162 from the Swedish Research Council.',
];

/** Minimal RFC-4180 parser — UCDP quotes source headlines containing commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

console.log(`Fetching ${SOURCE_URL}`);
const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Failed: HTTP ${res.status}. Nothing written — a stale asset is better than a truncated one.`);
  process.exit(1);
}
const csv = await res.text();

const rows = parseCsv(csv);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

const required = ['id', 'latitude', 'longitude', 'date_start'];
for (const col of required) {
  if (idx[col] === undefined) {
    console.error(`Upstream schema changed: column "${col}" is missing. Refusing to write a silently-wrong asset.`);
    process.exit(1);
  }
}

// Project to exactly what UcdpAdapter reads. Carrying the other 40 columns
// would quadruple the asset for fields nothing consumes.
const events = [];
let skipped = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.length < header.length - 2) { skipped++; continue; }
  const get = (c) => (idx[c] !== undefined ? row[idx[c]] : undefined);

  const lat = num(get('latitude'));
  const lon = num(get('longitude'));
  const id = get('id');
  if (!id || lat === undefined || lon === undefined) { skipped++; continue; }

  events.push({
    id,
    // UCDP dates are "YYYY-MM-DD 00:00:00.000"; the adapter parses ISO.
    date_start: (get('date_start') || '').split(' ')[0],
    // date_end and date_prec carry the event's TIME UNCERTAINTY. 240 of 1795
    // events in the current release are imprecise (prec 2-5: a few days, a
    // week, a month, a year). Dropping them made every event look day-precise,
    // so an event known only to within a year was corroborating inside a
    // 24-hour window as though it were exact.
    date_end: (get('date_end') || '').split(' ')[0] || undefined,
    date_prec: num(get('date_prec')),
    latitude: lat,
    longitude: lon,
    country: get('country') || undefined,
    region: get('region') || undefined,
    side_a: get('side_a') || undefined,
    side_b: get('side_b') || undefined,
    best: num(get('best')),
    deaths_civilians: num(get('deaths_civilians')),
    type_of_violence: num(get('type_of_violence')),
  });
}

const payload = {
  // Provenance travels with the data. A dataset without it is an assertion.
  source: 'UCDP Candidate Events Dataset',
  sourceUrl: SOURCE_URL,
  datasetVersion: DATASET_VERSION,
  license: 'CC BY 4.0',
  citation: CITATION,
  retrievedAt: new Date().toISOString(),
  eventCount: events.length,
  events,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(payload));

const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
console.log(`Wrote ${OUT_PATH}`);
console.log(`  ${events.length} events, ${skipped} skipped (no id or no coordinates), ${kb} KB`);
console.log(`  ${DATASET_VERSION}, CC BY 4.0 — citations embedded in the asset.`);
