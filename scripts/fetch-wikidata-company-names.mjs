#!/usr/bin/env node
/**
 * Add company names to the Wikidata snapshot (plan item 3.6).
 *
 * The snapshot keys each company by its LEI, and the analyzer showed a person
 * "LEI 3538…" for every company only Wikidata describes: on the build, all
 * eight single-source claims on screen. This asks Wikidata once for the label
 * of each company already in the snapshot and writes them beside the
 * statements as `companyNames`. The statements, the places and `retrievedAt`
 * are left exactly as they were, so nothing the engine compares or weighs
 * changes, and the asset's age is still the statements' age. The names are
 * for reading only.
 *
 * A company Wikidata has no label for, in any language asked, is left out,
 * and so is an LEI two items claim under different names: silence, not a
 * guess. A query that fails twice writes nothing, rather than a list that
 * quietly lacks a chunk.
 *
 * Usage: node scripts/fetch-wikidata-company-names.mjs [--asset path]
 * Exit:  0 wrote the names · 1 upstream failure · 2 bad usage
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const UA = 'starcom-app/0.1 (https://github.com/Arch-Angel-Agency-LLC/starcom-app)';
// English first, then the languages the snapshot's companies are registered in.
const LANGUAGES = 'en,mul,de,fr,es,it,nl,pl,sv,da,fi,pt,cs,no,ja,zh,ko';
const CHUNK = 100;

/** One label query's answer as {lei: name}: only LEIs with exactly one real label. */
export function companyNamesFrom(bindings) {
  const seen = new Map();
  for (const b of bindings) {
    const lei = b.lei?.value;
    const name = b.cLabel?.value?.trim();
    // The label service answers with the item id when it has no label.
    if (!lei || !name || /^Q\d+$/.test(name)) continue;
    seen.set(lei, (seen.get(lei) ?? new Set()).add(name));
  }
  const names = {};
  for (const [lei, set] of seen) if (set.size === 1) names[lei] = [...set][0];
  return names;
}

async function query(leis) {
  const values = leis.map((lei) => JSON.stringify(lei)).join(' ');
  const q = `SELECT ?lei ?cLabel WHERE {
    VALUES ?lei { ${values} }
    ?c wdt:P1278 ?lei .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGUAGES}". }
  }`;
  const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`,
    { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikidata returned ${res.status}`);
  return (await res.json()).results.bindings;
}

/** Names for these LEIs, asked in chunks. Throws when a chunk fails twice. */
export async function fetchCompanyNames(leis) {
  const bindings = [];
  for (let i = 0; i < leis.length; i += CHUNK) {
    const chunk = leis.slice(i, i + CHUNK);
    try {
      bindings.push(...await query(chunk));
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
      bindings.push(...await query(chunk));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return companyNamesFrom(bindings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--asset');
  const ASSET = at === -1 ? 'public/data/wikidata-hq.json' : args[at + 1];
  if (!ASSET || !fs.existsSync(ASSET)) { console.error(`No snapshot at ${ASSET}`); process.exit(2); }

  const asset = JSON.parse(fs.readFileSync(ASSET, 'utf8'));
  const leis = [...new Set((asset.statements ?? []).map((s) => s.lei).filter(Boolean))].sort();
  if (leis.length === 0) { console.error('The snapshot names no LEIs.'); process.exit(2); }

  console.log(`Asking Wikidata for ${leis.length} company names...`);
  let names;
  try {
    names = await fetchCompanyNames(leis);
  } catch (e) {
    console.error(`Nothing written: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  const count = Object.keys(names).length;
  fs.writeFileSync(ASSET, JSON.stringify({
    ...asset,
    companyNamesRetrievedAt: new Date().toISOString(),
    companyNameCount: count,
    companyNames: names,
  }, null, 2) + '\n');
  console.log(`Wrote ${count} names for ${leis.length} companies to ${ASSET}; ${leis.length - count} have none.`);
}
