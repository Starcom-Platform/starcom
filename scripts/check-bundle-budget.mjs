#!/usr/bin/env node
/**
 * What a first visit actually costs, measured and budgeted.
 *
 * Nothing in this repo measured the bundle, so it could only ever grow. The
 * plan recorded it as "the 47MB bundle", which is the size of the whole `dist`
 * directory — lazy route chunks, textures, and public data that a visitor
 * never downloads up front. The real first-visit figure is the entry script
 * plus everything `index.html` preloads, and it is roughly a quarter of that
 * raw and a tenth of it compressed.
 *
 * Both numbers matter and they measure different things:
 *   - GZIPPED is what crosses the wire, and what a slow link is charged for.
 *   - RAW is what the browser must parse and compile, which is what a cheap
 *     phone is actually limited by. A heavily-compressed 2MB of JavaScript is
 *     still 2MB of parsing.
 *
 * This exists for III.5's "works on a low-spec device and a slow link". The
 * people this app claims to serve are on exactly those, and a budget nobody
 * checks is an aspiration.
 *
 * Usage: node scripts/check-bundle-budget.mjs [--update]
 * Exit:  0 within budget · 1 over budget · 2 could not measure
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = 'dist';
const BUDGET_FILE = 'scripts/bundle-budget.json';

const cannotMeasure = (msg) => {
  console.error(`\n  CANNOT MEASURE: ${msg}`);
  console.error('  This says nothing about the bundle size. Run `npm run build` first.');
  process.exit(2);
};

const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) cannotMeasure(`${indexPath} does not exist`);

const html = fs.readFileSync(indexPath, 'utf8');

/**
 * Everything the browser fetches before it can render.
 *
 * Both the entry <script> and every <link rel="modulepreload">: a preload is
 * not optional, it is a static import the entry graph already requires, and
 * counting only the entry script would understate the cost about fourfold.
 */
const refs = new Set();
for (const m of html.matchAll(/<script[^>]+src="\/([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/rel="modulepreload"[^>]*href="\/([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/rel="stylesheet"[^>]*href="\/([^"]+)"/g)) refs.add(m[1]);

if (refs.size === 0) cannotMeasure('index.html referenced no scripts or stylesheets — the build output looks wrong');

let raw = 0, gz = 0;
const files = [];
for (const ref of [...refs].sort()) {
  const file = path.join(DIST, ref);
  if (!fs.existsSync(file)) continue; // an external or hashed-away reference
  const bytes = fs.readFileSync(file);
  const g = zlib.gzipSync(bytes, { level: 6 }).length;
  raw += bytes.length; gz += g;
  files.push({ ref, raw: bytes.length, gz: g });
}

files.sort((a, b) => b.gz - a.gz);
console.log('\n  First-visit payload — the entry script and everything it preloads\n');
for (const f of files) {
  console.log(`  ${(f.raw / 1024).toFixed(0).padStart(7)} KB raw ${(f.gz / 1024).toFixed(0).padStart(7)} KB gz   ${f.ref}`);
}

const rawMB = raw / 1024 / 1024;
const gzMB = gz / 1024 / 1024;
console.log(`\n  TOTAL: ${rawMB.toFixed(2)} MB raw (parse cost) · ${gzMB.toFixed(2)} MB gzipped (transfer cost)`);

// Context, so the "47MB" figure is not quoted at people again.
let distBytes = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else distBytes += fs.statSync(p).size;
  }
};
walk(DIST);
console.log(`  For context, the whole dist is ${(distBytes / 1024 / 1024).toFixed(1)} MB — lazy chunks and public assets a visitor never fetches up front.\n`);

if (process.argv.includes('--update')) {
  fs.writeFileSync(BUDGET_FILE, JSON.stringify({
    note: 'First-visit budget. Raise these ONLY with a stated reason — a budget that moves whenever it is exceeded measures nothing.',
    maxRawMB: Number((rawMB * 1.02).toFixed(2)),
    maxGzipMB: Number((gzMB * 1.02).toFixed(2)),
    recordedAt: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');
  console.log(`  Budget written to ${BUDGET_FILE}\n`);
  process.exit(0);
}

if (!fs.existsSync(BUDGET_FILE)) cannotMeasure(`no budget recorded — run with --update to establish one`);
const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));

const over = [];
if (rawMB > budget.maxRawMB) over.push(`raw ${rawMB.toFixed(2)} MB > ${budget.maxRawMB} MB`);
if (gzMB > budget.maxGzipMB) over.push(`gzipped ${gzMB.toFixed(2)} MB > ${budget.maxGzipMB} MB`);

if (over.length) {
  console.log(`  OVER BUDGET: ${over.join('; ')}`);
  console.log('  Either reduce it, or raise the budget deliberately with --update and say why in the commit.\n');
  process.exit(1);
}
console.log('  Within budget.\n');
