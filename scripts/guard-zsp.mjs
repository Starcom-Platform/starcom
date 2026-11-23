#!/usr/bin/env node
/**
 * @asserts A ZSP 2.0 partition is served only when it covers the globe once over, each Sector in its Zone and each Zone in its Terra or Mare, every ring sound and every source free to build a CC BY 4.0 partition from.
 *
 * Decision D-ZR (ZR9): Mecha Jono's export runs these checks, and Starcom's build runs the same ones on what it is
 * about to serve, so a partition with a gap, an overlap, a Sector out of size or a share-alike source is refused here
 * rather than drawn. The checks are src/geopolitical/zones/zspChecks.ts, which reads the files through the reader the
 * globe uses. While ZSP 1.0 is served, there is nothing for them to check, and it says so.
 *
 * Usage: tsx --tsconfig tsconfig.app.json scripts/guard-zsp.mjs [folder]
 * Exit:  0 passed, or 1.0 served · 1 a check failed, or the manifest could not be read
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkPartition } from '../src/geopolitical/zones/zspChecks';

const FOLDER = path.resolve(process.argv[2] ?? 'public/geopolitical/zones');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(FOLDER, 'manifest.json'), 'utf8'));
} catch (e) {
  console.error(`ZSP: the manifest in ${FOLDER} could not be read: ${e.message}`);
  process.exit(1);
}
const files = {};
for (const name of fs.readdirSync(FOLDER)) if (name.endsWith('.zsp.geojson')) files[name] = fs.readFileSync(path.join(FOLDER, name), 'utf8');

const report = checkPartition(manifest, files, (text) => createHash('sha256').update(text).digest('hex'));
if (report.edition !== '2.0') {
  console.log(`ZSP ${report.edition ?? '(no edition)'} served: the 2.0 checks wait for the whole-globe partition (D-ZR).`);
  process.exit(0);
}
if (report.problems.length > 0) {
  console.error(`ZSP 2.0 REFUSED — ${report.problems.length} problem(s):`);
  for (const p of report.problems.slice(0, 60)) console.error(`  ${p}`);
  if (report.problems.length > 60) console.error(`  … and ${report.problems.length - 60} more`);
  process.exit(1);
}
console.log(`ZSP 2.0: ${report.containers} Terrae and Maria, ${report.zones} Zones, ${report.sectors} Sectors, ${Math.round(report.coveredKm2).toLocaleString('en')} km²; `
  + `${(report.bytes / 1e6).toFixed(2)} MB, ${report.points.toLocaleString('en')} ring points; every check passed.`);
