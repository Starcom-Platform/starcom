#!/usr/bin/env node
/**
 * Make public/data/eia-production.json from EIA's keyless bulk file: crude oil, dry natural gas and
 * renewables production by country (decision D-DP, DP17).
 *
 * Run under tsx, so the format is the TypeScript module the app reads it with —
 * src/services/geopolitical/eiaBulk.ts, which says what is kept and why.
 *
 * ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * Run in the build. EIA publishes these once a year and the bulk file is 24 MB:
 * run it when EIA does, and commit what it writes.
 *
 * Write a file with a series missing. If the bulk file lacks one, nothing is
 * written, and the file already committed stays.
 *
 * Usage:
 *   npm run data:eia
 *   npm run data:eia -- --from <INTL.zip>   read a bulk file already downloaded
 *
 * @asserts public/data/eia-production.json, when written, holds all three series.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { energyFileFromBulk } from '../src/services/geopolitical/eiaBulk';
import { ENERGY_FILE_URL, ENERGY_SERIES, parseEnergyFile } from '../src/services/geopolitical/energyProduction';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public', ENERGY_FILE_URL.replace(/^\//, ''));
const BULK_URL = 'https://www.eia.gov/opendata/bulk/INTL.zip';
const say = (m) => console.log(`snapshot-eia: ${m}`);

async function bulkZip() {
  const at = process.argv.indexOf('--from');
  if (at > 0) return fs.readFileSync(process.argv[at + 1]);
  say(`downloading ${BULK_URL}`);
  const res = await fetch(BULK_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const zip = await JSZip.loadAsync(await bulkZip());
const entry = zip.file('INTL.txt');
if (!entry) throw new Error('the bulk file holds no INTL.txt');
const file = energyFileFromBulk((await entry.async('string')).split('\n'));

const read = parseEnergyFile(file);
const missing = ENERGY_SERIES.filter((s) => !read[s]);
if (missing.length) {
  say(`not written: no ${missing.join(', ')} in the bulk file`);
  process.exit(1);
}
fs.writeFileSync(OUT, `${JSON.stringify(file)}\n`);
for (const s of ENERGY_SERIES) say(`${s}: ${Object.keys(read[s].values).length} producers in ${read[s].year}, ${read[s].unit}`);
say(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes), EIA updated ${file.updated}`);
