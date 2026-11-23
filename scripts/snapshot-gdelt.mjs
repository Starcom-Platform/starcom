#!/usr/bin/env node
/**
 * Build the day of GDELT events the app loads: public/data/gdelt-events.json.
 *
 * Run under tsx, so the parser and the snapshot format are the TypeScript
 * modules the app itself uses — src/services/geopolitical/gdeltEventExport.ts
 * and gdeltSnapshot.ts, which say why this exists and why at build time.
 *
 * ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * Fail the build. GDELT is a third party; a deploy that failed whenever it
 * hiccupped would teach everyone to bypass this. If nothing arrives, no
 * snapshot is written, and the app says in its caveats that this build
 * carries none — which is true.
 *
 * Refetch a day it already has. A snapshot younger than one GDELT window is
 * reused, so a run of local builds does not download the same 14 MB (the day's
 * export and Mentions files) each time.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.app.json scripts/snapshot-gdelt.mjs
 *   GDELT_SNAPSHOT_FORCE=1 …   refetch even if the current one is fresh
 *
 * @asserts public/data/gdelt-events.json, when written, parses as the snapshot
 *          the app reads and lists every window it was built from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { parseGdeltExport } from '../src/services/geopolitical/gdeltEventExport';
import { highestConfidence } from '../src/services/geopolitical/gdeltMentions';
import {
  GDELT_SNAPSHOT_URL,
  GDELT_WINDOW_MS,
  buildGdeltSnapshot,
  readGdeltSnapshot,
  windowsEndingAt,
} from '../src/services/geopolitical/gdeltSnapshot';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public', GDELT_SNAPSHOT_URL.replace(/^\//, ''));
const BASE = 'https://data.gdeltproject.org/gdeltv2';
const TIMEOUT_MS = 20000;
const say = (m) => console.log(`snapshot-gdelt: ${m}`);

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

async function unzipped(url) {
  const res = await get(url);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const file = Object.values(zip.files)[0];
  if (!file) throw new Error('empty zip');
  return file.async('text');
}

async function fetchWindow(stamp) {
  return parseGdeltExport(await unzipped(`${BASE}/${stamp}.export.CSV.zip`));
}

/*
 * The coder's confidence (D-DP, DP10): each event's surest mention in the day's Mentions files,
 * kept only for the events the snapshot holds. 60–90 KB zipped a window, about 7 MB a day. A file
 * that does not arrive is listed, and its events' confidence stays unknown.
 */
async function fetchConfidence(requested, ids) {
  const confidence = new Map();
  const arrived = new Set();
  const attempt = async (stamps) => Promise.all(stamps.map(async (s) => {
    try {
      highestConfidence(await unzipped(`${BASE}/${s}.mentions.CSV.zip`), ids, confidence);
      arrived.add(s);
    } catch { /* recorded as missing below */ }
  }));
  await attempt(requested);
  const retry = requested.filter((s) => !arrived.has(s));
  if (retry.length) await attempt(retry);
  return { confidence, missing: requested.filter((s) => !arrived.has(s)) };
}

async function main() {
  if (!process.env.GDELT_SNAPSHOT_FORCE && fs.existsSync(OUT)) {
    try {
      const current = readGdeltSnapshot(JSON.parse(fs.readFileSync(OUT, 'utf8')));
      const age = Date.now() - current.retrievedAt;
      if (age >= 0 && age < GDELT_WINDOW_MS) {
        say(`reusing ${path.relative(process.cwd(), OUT)} — retrieved ${Math.round(age / 60000)} min ago, inside one GDELT window`);
        return;
      }
    } catch {
      // Unreadable: rebuild it.
    }
  }

  let newest;
  try {
    // GDELT names its newest file here, so the day is anchored on what exists
    // rather than on a guess from the clock that could land on an unpublished window.
    const text = await (await get(`${BASE}/lastupdate.txt`)).text();
    newest = /(\d{14})\.export\.CSV\.zip/.exec(text)?.[1];
    if (!newest) throw new Error('no export file named in lastupdate.txt');
  } catch (error) {
    say(`GDELT unavailable (${error.message}) — no snapshot written; this build will say it has none`);
    return;
  }

  const requested = windowsEndingAt(newest);
  const received = new Map();
  const attempt = async (stamps) => Promise.all(stamps.map(async (s) => {
    try { received.set(s, await fetchWindow(s)); } catch { /* recorded as missing below */ }
  }));
  const started = Date.now();
  await attempt(requested);
  const retry = requested.filter((s) => !received.has(s));
  if (retry.length) await attempt(retry);

  if (received.size === 0) {
    say('no GDELT window arrived — no snapshot written; this build will say it has none');
    return;
  }

  const ids = new Set([...received.values()].flat().map((e) => e.id));
  const mentions = await fetchConfidence(requested, ids);
  const snapshot = buildGdeltSnapshot({ requested, received, retrievedAt: new Date(), mentions });
  // Proven readable by the same reader the app uses, before anything is written.
  const loaded = readGdeltSnapshot(snapshot);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snapshot));
  say(`${loaded.events.length} events from ${loaded.windowsReceived}/${loaded.windowsRequested} windows ending ${newest}`
    + ` in ${Date.now() - started} ms → ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`
    + (snapshot.windows.missing.length ? ` — MISSING ${snapshot.windows.missing.join(', ')}` : '')
    + `; confidence for ${mentions.confidence.size} events`
    + (mentions.missing.length ? ` — MENTIONS MISSING ${mentions.missing.join(', ')}` : ''));
}

main().catch((error) => {
  // Anything unexpected is still not a reason to fail a deploy over a third party.
  say(`failed (${error?.message ?? error}) — no snapshot written`);
});
