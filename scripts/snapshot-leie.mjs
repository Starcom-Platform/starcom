#!/usr/bin/env node
/**
 * Build the Opportunity Board's health care exclusions: public/data/health-exclusions.json, the last
 * three monthly supplements to HHS-OIG's LEIE, counted (decision D-BF, BF1, BF2).
 *
 * Run under tsx, so the digest and the file format are the TypeScript modules the app and its tests
 * use — src/services/exchange/feeds/leieSupplement.ts and healthExclusions.ts, which say why.
 *
 * ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * Fail the build. If no supplement arrives, no file is written and the board says this build holds
 * none. A month looked for and not found is listed as missing.
 *
 * Name a person, or keep anything of one. The supplements carry each person's name, date of birth,
 * NPI and home address; the digest counts people and returns none of it, and nothing else is written.
 *
 * Refetch within the day. OIG publishes once a month; a file younger than a day is reused.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.app.json scripts/snapshot-leie.mjs
 *   LEIE_SNAPSHOT_FORCE=1 …   refetch even if the current one is fresh
 *
 * @asserts public/data/health-exclusions.json, when written, reads back whole as the file the app reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monthFromLeie } from '../src/services/exchange/feeds/leieSupplement';
import { EXCLUSIONS_FILE_URL, MONTHS_SHOWN, parseExclusionsFile } from '../src/services/exchange/feeds/healthExclusions';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public', EXCLUSIONS_FILE_URL.replace(/^\//, ''));
const BASE = 'https://oig.hhs.gov/exclusions/downloadables';
const TIMEOUT_MS = 30000;
const FRESH_MS = 24 * 60 * 60 * 1000;
/** How far back to look for the newest three: OIG publishes a month's supplement early in the next. */
const LOOK_BACK = 6;
const say = (m) => console.log(`snapshot-leie: ${m}`);

/** The file's text, or null when OIG has not published it. */
async function text(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // OIG's files are Latin-1.
    return new TextDecoder('latin1').decode(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!process.env.LEIE_SNAPSHOT_FORCE && fs.existsSync(OUT)) {
    try {
      const age = Date.now() - Date.parse(JSON.parse(fs.readFileSync(OUT, 'utf8')).retrievedAt);
      if (age >= 0 && age < FRESH_MS) {
        say(`reusing ${path.relative(process.cwd(), OUT)}, retrieved ${Math.round(age / 3600000)} h ago`);
        return;
      }
    } catch {
      // Unreadable: rebuild it.
    }
  }

  const now = new Date();
  const months = [];
  const missing = [];
  for (let back = 0; back < LOOK_BACK && months.length < MONTHS_SHOWN; back++) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const month = at.toISOString().slice(0, 7);
    const yymm = month.slice(2, 4) + month.slice(5, 7);
    try {
      const excl = await text(`${BASE}/${month.slice(0, 4)}/${yymm}excl.csv`);
      if (excl === null) continue; // not published yet, or not this month
      const rein = await text(`${BASE}/${month.slice(0, 4)}/${yymm}rein.csv`);
      months.push(monthFromLeie(month, excl, rein));
    } catch (error) {
      missing.push(month);
      say(`${month}: ${error.message}`);
    }
  }
  if (months.length === 0) {
    say('no supplement arrived: no file written; this build will say it holds none');
    return;
  }

  const file = {
    version: 1,
    source: 'HHS Office of Inspector General, List of Excluded Individuals/Entities (monthly supplements)',
    url: 'https://oig.hhs.gov/exclusions/supplements.asp',
    license: 'Public domain (a U.S. Government work)',
    retrievedAt: now.toISOString(),
    months,
    missing,
  };
  if (parseExclusionsFile(JSON.parse(JSON.stringify(file))).length !== months.length) throw new Error('the file does not read back whole');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file));
  say(`${months.map((m) => `${m.month}: ${m.exclusions} excluded, ${m.organisations.length} named`).join('; ')}`
    + `${missing.length ? `; missing ${missing.join(', ')}` : ''} → ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
}

main().catch((error) => {
  // Never the build's failure: the board says this build holds no file.
  say(`not written: ${error.message}`);
});
