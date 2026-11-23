#!/usr/bin/env node
/**
 * Fetch Wikidata headquarters statements for LEI-carrying companies.
 *
 * Written to public/data/wikidata-hq.json as a static CC0 asset, the same
 * shape and for the same reasons as the GLEIF and UCDP assets.
 *
 * Every statement carries THE SOURCE IT CITES. That is the entire point: this
 * is an aggregator, not an observer, and flattening its statements into one
 * "wikidata" feed would let the 5,957 statements imported from the Global LEI
 * Index corroborate GLEIF itself.
 *
 * Usage: node scripts/fetch-wikidata-hq.mjs [--limit N] [--out path]
 * Exit:  0 wrote the asset · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchCompanyNames } from './fetch-wikidata-company-names.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const LIMIT = Number(arg('--limit', '2000'));
const OUT = arg('--out', 'public/data/wikidata-hq.json');
if (!Number.isFinite(LIMIT) || LIMIT <= 0) { console.error('--limit must be positive'); process.exit(2); }

const UA = 'starcom-app/0.1 (https://github.com/Arch-Angel-Agency-LLC/starcom-app)';

/**
 * `?modified` is the ITEM's last edit, not the statement's.
 *
 * Wikidata does not expose per-statement modification times. This is coarser
 * than we would like and it is recorded rather than hidden: an item edited
 * yesterday for an unrelated reason will carry yesterday's date on a
 * headquarters statement that has not changed in years. It makes the
 * age-decayed weight slightly generous, never the reverse, and the day-level
 * `timePrecisionMs` the adapter sets says the timing is not exact.
 */
const QUERY = `SELECT ?lei ?hq ?hqLabel ?ccIso ?src ?srcLabel ?modified WHERE {
  ?c wdt:P1278 ?lei .
  ?c p:P159 ?st .
  ?st ps:P159 ?hq .
  ?st prov:wasDerivedFrom ?ref .
  { ?ref pr:P248 ?src } UNION { ?ref pr:P143 ?src }
  OPTIONAL { ?hq wdt:P17 ?cc . OPTIONAL { ?cc wdt:P297 ?ccIso } }
  ?c schema:dateModified ?modified .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT ${LIMIT}`;

const res = await fetch(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`,
  { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } },
);
if (!res.ok) { console.error(`Wikidata returned ${res.status}`); process.exit(1); }

const rows = (await res.json()).results.bindings;
const statements = rows.map((r) => ({
  lei: r.lei?.value,
  // The place's Wikidata item id — the canonical identity. `hqLabel` rides
  // along for display only, exactly as the company name does beside its LEI.
  hqQid: r.hq?.value?.split('/').pop(),
  hq: r.hqLabel?.value,
  // The ISO 3166-1 alpha-2 CODE (P297), not the country's name.
  //
  // Measured: comparing GLEIF's "de" against Wikidata's "Germany" agreed on
  // 0 of 113 comparable pairs. The two sources never disagreed about a single
  // country — they were simply speaking different languages, and the engine
  // read that as universal contradiction.
  country: r.ccIso?.value,
  sourceQid: r.src?.value?.split('/').pop(),
  sourceLabel: r.srcLabel?.value,
  modified: r.modified?.value,
}));

if (statements.length === 0) {
  console.error('No statements returned — refusing to write an empty asset over a good one.');
  process.exit(1);
}

/**
 * A gazetteer for the places these statements name.
 *
 * Cities do not share a name across languages: GLEIF writes `Köln` and
 * `München` because it records addresses in the local language, and Wikidata's
 * English label says `Cologne` and `Munich`. Compared as strings they read as
 * disagreement, which measured at 52% agreement and quietly excluded most
 * German cities (D14).
 *
 * The fix is the one that already made the company join work: identify by a
 * third-party identifier instead of inferring from names. Wikidata assigns the
 * place a Q-id and knows what it is called in every language, so the gazetteer
 * maps every known name back to that id and both feeds can speak it.
 *
 * Scoped by country, because names collide across borders far more often than
 * within one.
 */
async function fetchGazetteer(qids) {
  const places = new Map();
  const CHUNK = 60;
  for (let i = 0; i < qids.length; i += CHUNK) {
    const values = qids.slice(i, i + CHUNK).map((q) => `wd:${q}`).join(' ');
    const q = `SELECT ?hq ?name ?ccIso WHERE {
      VALUES ?hq { ${values} }
      ?hq wdt:P17 ?cc . ?cc wdt:P297 ?ccIso .
      { ?hq rdfs:label ?name } UNION { ?hq skos:altLabel ?name }
      FILTER(lang(?name) IN ("en","de","fr","es","it","nl","pl","sv","da","fi","pt","cs","no"))
    }`;
    const r = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
    if (!r.ok) { console.error(`  gazetteer chunk ${i / CHUNK} failed: ${r.status}`); continue; }
    for (const b of (await r.json()).results.bindings) {
      const qid = b.hq.value.split('/').pop();
      const entry = places.get(qid) ?? { qid, countryIso: b.ccIso?.value, names: new Set() };
      entry.names.add(b.name.value);
      places.set(qid, entry);
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return [...places.values()].map((p) => ({ ...p, names: [...p.names].sort() }));
}

const placeQids = [...new Set(statements.map((s) => s.hqQid).filter(Boolean))];
console.log(`Building gazetteer for ${placeQids.length} places...`);
const places = await fetchGazetteer(placeQids);
console.log(`  ${places.length} places, ${places.reduce((n, p) => n + p.names.length, 0)} names`);

// Each company's name, for reading only (plan item 3.6): without it a person
// saw only the LEI. See fetch-wikidata-company-names.mjs.
const leis = [...new Set(statements.map((s) => s.lei).filter(Boolean))].sort();
console.log(`Asking for ${leis.length} company names...`);
const companyNames = await fetchCompanyNames(leis);
console.log(`  ${Object.keys(companyNames).length} names`);

// Reported so a reader of the file can see the provenance mix without parsing
// it, and so a sudden shift in it is visible in a diff.
const bySource = {};
for (const s of statements) bySource[s.sourceLabel ?? s.sourceQid ?? '(none)'] =
  (bySource[s.sourceLabel ?? s.sourceQid ?? '(none)'] ?? 0) + 1;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'Wikidata — headquarters statements on LEI-carrying companies',
  sourceUrl: 'https://query.wikidata.org/sparql',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  citation: ['Wikidata contributors, https://www.wikidata.org/ — CC0 1.0'],
  retrievedAt: new Date().toISOString(),
  statementCount: statements.length,
  placeCount: places.length,
  citedSources: bySource,
  timestampCaveat: 'modified is the ITEM last-edit date; Wikidata exposes no per-statement modification time.',
  statements,
  places,
  companyNamesRetrievedAt: new Date().toISOString(),
  companyNameCount: Object.keys(companyNames).length,
  companyNames,
}, null, 2) + '\n');

console.log(`Wrote ${statements.length} statements to ${OUT}`);
console.log('Cited sources:');
for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(v).padStart(6)}  ${k}`);
}
