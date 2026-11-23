#!/usr/bin/env node
/**
 * Build the threat indicators the Cyber Threats layer loads:
 * public/data/threat-indicators.json.
 *
 * Run under tsx, so the list definitions, the sampling and the snapshot format are
 * the TypeScript modules the app itself uses — src/services/CyberAttacks/
 * threatSources.ts and threatSnapshot.ts, which say why this exists.
 *
 * Every list is dated by its own account — firehol's "Source File Date" header, or
 * for the ThreatFox mirror its repository's last commit to the file — never by the
 * moment it was fetched. A list that cannot be dated, or is older than a week, is
 * recorded and not drawn.
 *
 * Like snapshot-gdelt.mjs it never fails the build: if the lists or the geolocation
 * table cannot be had, no snapshot is written and the layer says so.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.app.json scripts/snapshot-threats.mjs
 *   THREAT_SNAPSHOT_FORCE=1 …   refetch even if the current one is recent
 *
 * @asserts public/data/threat-indicators.json, when written, parses as the snapshot
 *          the app reads and records every list's date and status.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREAT_SOURCES, fireholListDate } from '../src/services/CyberAttacks/threatSources';
import { THREAT_SNAPSHOT_URL, buildThreatSnapshot, readThreatSnapshot } from '../src/services/CyberAttacks/threatSnapshot';
import { parseCountryRangesCsv, binarySearchCountry, ipToUint32 } from '../src/services/geolocation/ipCountryTable';
import { iso2ToIso3 } from '../src/services/geolocation/iso2to3CountryCodes';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public', THREAT_SNAPSHOT_URL.replace(/^\//, ''));
const DBIP_URL = 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv4.csv';
const REUSE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 30000;
const say = (m) => console.log(`snapshot-threats: ${m}`);

async function text(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'starcom-build (+https://starcom.app)', ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** The date of a repository's last commit to one file, or null. */
async function lastCommitDate({ repo, path: file }) {
  try {
    const body = await text(`https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(file)}&per_page=1`,
      { Accept: 'application/vnd.github+json' });
    const date = new Date(JSON.parse(body)?.[0]?.commit?.committer?.date ?? '');
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.THREAT_SNAPSHOT_FORCE && fs.existsSync(OUT)) {
    try {
      const current = readThreatSnapshot(JSON.parse(fs.readFileSync(OUT, 'utf8')));
      const age = Date.now() - current.retrievedAt;
      if (age >= 0 && age < REUSE_MS) {
        say(`reusing ${path.relative(process.cwd(), OUT)} — retrieved ${Math.round(age / 60000)} min ago`);
        return;
      }
    } catch { /* unreadable: rebuild */ }
  }

  const started = Date.now();
  const [fetched, dbip] = await Promise.all([
    Promise.all(THREAT_SOURCES.map(async (def) => {
      try {
        const [body, commitDate] = await Promise.all([
          text(def.url),
          def.datedByCommit ? lastCommitDate(def.datedByCommit) : Promise.resolve(undefined),
        ]);
        return { def, text: body, commitDate };
      } catch (error) {
        return { def, text: null, error: error.message };
      }
    })),
    text(DBIP_URL).catch((error) => { say(`DB-IP table unavailable (${error.message})`); return null; }),
  ]);

  if (fetched.every((f) => f.text === null) || dbip === null) {
    say('no lists, or nothing to place them with — no snapshot written; this build will say it has none');
    return;
  }

  const table = parseCountryRangesCsv(dbip);
  const countryOf = (ip) => {
    const n = ipToUint32(ip);
    const iso2 = n === null ? null : binarySearchCountry(table, n);
    return iso2 ? iso2ToIso3(iso2) : null;
  };
  const snapshot = buildThreatSnapshot({
    fetched,
    countryOf,
    retrievedAt: new Date(),
    listDateOf: (f) => (f.def.hasFireholHeader ? fireholListDate(f.text ?? '') : f.commitDate ?? null),
    geolocation: {
      source: 'IP Geolocation by DB-IP (https://db-ip.com) — Country Lite, via sapics/ip-location-db',
      terms: 'CC BY 4.0',
    },
  });

  let loaded;
  try {
    loaded = readThreatSnapshot(snapshot); // the app's own reader, before anything is written
  } catch (error) {
    say(`nothing drawable (${error.message}) — no snapshot written`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snapshot));
  const notDrawn = snapshot.lists.filter((l) => l.status !== 'drawn');
  const placed = snapshot.indicators.filter((i) => i.country).length;
  say(`${snapshot.indicators.length} indicators (${placed} placed) from ${snapshot.lists.length - notDrawn.length}/${snapshot.lists.length} lists`
    + ` in ${Date.now() - started} ms → ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`
    + `; oldest list drawn ${new Date(loaded.asOf).toISOString()}`);
  for (const l of notDrawn) say(`  not drawn: ${l.label} — ${l.reason}`);
}

main().catch((error) => say(`failed (${error?.message ?? error}) — no snapshot written`));
