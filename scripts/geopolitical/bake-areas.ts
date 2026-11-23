/**
 * Bakes the areas' shapes (areaBake.ts) into public/geopolitical/areas-lod0.geojson,
 * which the app loads once a report names an area, and records its digest in
 * the folder's manifest when it changed.
 *
 * Usage: npm run bake:areas
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bakeAreas, type Territory } from './areaBake';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = 'public/geopolitical/world-territories-lod0.geojson';
const OUT = 'public/geopolitical/areas-lod0.geojson';
const MANIFEST = 'public/geopolitical/manifest.json';

const territories = (JSON.parse(fs.readFileSync(path.join(ROOT, SOURCE), 'utf8')) as { features: Territory[] }).features;
const baked = bakeAreas(territories, SOURCE);
const text = `${JSON.stringify(baked)}\n`;
fs.writeFileSync(path.join(ROOT, OUT), text);

const sha256 = crypto.createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8')) as { datasets: Array<Record<string, string>> };
const entry = manifest.datasets.find((d) => d.id === 'areas');
if (entry?.sha256 !== sha256) {
  // Dated only when the bytes change, so baking again changes nothing.
  const today = new Date().toISOString().slice(0, 10);
  const next = {
    id: 'areas',
    version: today.replace(/-/g, '.'),
    file: path.basename(OUT),
    sha256,
    license: 'Public Domain (Natural Earth / derived by scripts/geopolitical/bake-areas.ts); zones drawn by Starcom from cited sources',
    updated: today,
  };
  manifest.datasets = entry ? manifest.datasets.map((d) => (d === entry ? next : d)) : [...manifest.datasets, next];
  fs.writeFileSync(path.join(ROOT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`${baked.features.length} areas baked into ${OUT} (${text.length} bytes, sha256 ${sha256}), definitions ${baked.definitionsHash}`);
for (const { properties, geometry } of baked.features) {
  const parts = geometry.type === 'Polygon' ? 1 : geometry.coordinates.length;
  console.log(`  ${properties.code.padEnd(26)} ${geometry.type.padEnd(12)} ${parts} part(s)`);
}
