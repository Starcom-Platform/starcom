#!/usr/bin/env node
/**
 * Build the Opportunity Board's sanctions changes: public/data/sanctions-changes.json, OFAC's
 * publications of the last 30 days, counted by programme (decision D-BF, BF1, BF2). And the SDN list
 * counted by country, for Diplomacy's country brief: public/data/sanctions-by-country.json (D-DP, DP6).
 *
 * Run under tsx, so the parsers and the file formats are the TypeScript modules the app and its tests
 * use — src/services/exchange/feeds/ofacDelta.ts, sanctionsChanges.ts and sdnByCountry.ts, which say why.
 *
 * ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * Fail the build. OFAC is a third party. If its list of publications does not answer, no file is
 * written and the board says this build holds none. A delta file that does not arrive is listed in
 * the file as missing, never guessed.
 *
 * Name a person. People are counted; the parser never reads a person's name.
 *
 * Refetch within the hour. A file younger than an hour is reused, so a run of local builds does not
 * download the same deltas (up to 600 KB each) again.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.app.json scripts/snapshot-ofac.mjs
 *   OFAC_SNAPSHOT_FORCE=1 …   refetch even if the current one is fresh
 *
 * @asserts public/data/sanctions-changes.json, when written, reads back whole as the file the app reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationFromDelta } from '../src/services/exchange/feeds/ofacDelta';
import { OFAC_HISTORY_URL, SANCTIONS_FILE_URL, WINDOW_DAYS, parseSanctionsFile } from '../src/services/exchange/feeds/sanctionsChanges';
import { namedCountries, sdnByCountry } from '../src/services/exchange/feeds/sdnByCountry';
import { SANCTIONS_BY_COUNTRY_URL, parseSanctionsByCountry } from '../src/geopolitical/utils/countrySanctions';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public', SANCTIONS_FILE_URL.replace(/^\//, ''));
const BY_COUNTRY = path.resolve(here, '../public', SANCTIONS_BY_COUNTRY_URL.replace(/^\//, ''));
const TERRITORIES = path.resolve(here, '../public/geopolitical/world-territories-lod0.geojson');
const EXPORT_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports';
const DELTA_URL = 'https://sanctionslistservice.ofac.treas.gov/changes';
const TIMEOUT_MS = 30000;
const FRESH_MS = 60 * 60 * 1000;
const say = (m) => console.log(`snapshot-ofac: ${m}`);

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a file this script wrote is younger than FRESH_MS; said so when it is. */
function fresh(file) {
  if (process.env.OFAC_SNAPSHOT_FORCE || !fs.existsSync(file)) return false;
  try {
    const age = Date.now() - Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).retrievedAt);
    if (age >= 0 && age < FRESH_MS) {
      say(`reusing ${path.relative(process.cwd(), file)}, retrieved ${Math.round(age / 60000)} min ago`);
      return true;
    }
  } catch {
    // Unreadable: rebuild it.
  }
  return false;
}

/** The SDN list by country, from OFAC's SDN.CSV and ADD.CSV (about 7 MB), matched to the globe's countries. */
async function byCountry() {
  if (fresh(BY_COUNTRY)) return;
  try {
    const [sdn, add] = await Promise.all(['SDN.CSV', 'ADD.CSV'].map(async (f) => new TextDecoder('latin1').decode(await (await get(`${EXPORT_URL}/${f}`)).arrayBuffer())));
    const countries = namedCountries(JSON.parse(fs.readFileSync(TERRITORIES, 'utf8')).features);
    const counted = sdnByCountry(sdn, add, countries);
    const file = {
      version: 1,
      source: "U.S. Treasury, Office of Foreign Assets Control: the SDN list's entries and addresses",
      url: 'https://sanctionssearch.ofac.treas.gov/',
      license: 'Public domain (a U.S. Government work)',
      retrievedAt: new Date().toISOString(),
      ...counted,
    };
    if (Object.keys(parseSanctionsByCountry(JSON.parse(JSON.stringify(file))).countries).length !== Object.keys(counted.countries).length) {
      throw new Error('the file does not read back whole');
    }
    fs.mkdirSync(path.dirname(BY_COUNTRY), { recursive: true });
    fs.writeFileSync(BY_COUNTRY, JSON.stringify(file));
    const unmatched = Object.entries(counted.unmatched);
    say(`SDN list: ${Object.keys(counted.countries).length} countries${unmatched.length ? `; not matched: ${unmatched.map(([n, c]) => `${n} (${c})`).join(', ')}` : ''}`
      + ` → ${path.relative(process.cwd(), BY_COUNTRY)} (${Math.round(fs.statSync(BY_COUNTRY).size / 1024)} KB)`);
  } catch (error) {
    say(`SDN list by country not written: ${error.message}`);
  }
}

async function main() {
  await byCountry();
  if (fresh(OUT)) return;

  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  let wanted;
  try {
    const years = [...new Set([Number(from.slice(0, 4)), now.getUTCFullYear()])];
    const lists = await Promise.all(years.map(async (year) => (await get(`${OFAC_HISTORY_URL}/${year}`)).json()));
    wanted = lists.flat().filter((p) => p.datePublished.slice(0, 10) >= from).map((p) => p.publicationID);
  } catch (error) {
    say(`OFAC's list of publications did not answer (${error.message}): no file written; this build will say it holds none`);
    return;
  }

  const read = new Map();
  const attempt = async (ids) => {
    for (const id of ids) {
      try {
        read.set(id, await publicationFromDelta(await (await get(`${DELTA_URL}/${id}`)).text(), id));
      } catch { /* listed as missing below */ }
    }
  };
  const started = Date.now();
  await attempt(wanted);
  const retry = wanted.filter((id) => !read.has(id));
  if (retry.length) await attempt(retry);

  const file = {
    version: 1,
    source: 'U.S. Treasury, Office of Foreign Assets Control (Sanctions List Service)',
    url: 'https://ofac.treasury.gov/recent-actions',
    license: 'Public domain (a U.S. Government work)',
    retrievedAt: now.toISOString(),
    from,
    publications: [...read.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    missing: wanted.filter((id) => !read.has(id)),
  };
  // Proven readable by the reader the app uses, whole, before anything is written.
  const back = parseSanctionsFile(JSON.parse(JSON.stringify(file)));
  if (back.publications.length !== file.publications.length) throw new Error('the file does not read back whole');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file));
  say(`${file.publications.length} of ${wanted.length} publications since ${from} in ${Date.now() - started} ms`
    + `${file.missing.length ? `, missing ${file.missing.join(', ')}` : ''} → ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
}

main().catch((error) => {
  // Never the build's failure: the board says this build holds no file.
  say(`not written: ${error.message}`);
});
