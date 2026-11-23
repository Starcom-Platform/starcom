/**
 * The header search's Zones (src/features/globe/zones/zoneSearch.ts), baked from what public/geopolitical/zones
 * serves, so the search opens on a few kilobytes rather than on the whole partition.
 *
 * Usage: tsx --tsconfig tsconfig.app.json scripts/geopolitical/bake-zone-search.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { indexFrom, manifestEntriesFrom } from '../../src/geopolitical/zones/zsp';
import { zoneSearchOf } from '../../src/features/globe/zones/zoneSearch';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FOLDER = path.join(ROOT, 'public/geopolitical/zones');
const OUT = path.join(ROOT, 'public/geopolitical/zones-search.json');

const manifest = JSON.parse(fs.readFileSync(path.join(FOLDER, 'manifest.json'), 'utf8'));
const docs = manifestEntriesFrom(manifest).map((entry) => JSON.parse(fs.readFileSync(path.join(FOLDER, entry.file), 'utf8')));
const text = `${JSON.stringify(zoneSearchOf(indexFrom(manifest, docs)))}\n`;
fs.writeFileSync(OUT, text);
const served = fs.readdirSync(FOLDER).reduce((n, name) => n + fs.statSync(path.join(FOLDER, name)).size, 0);
console.log(`zones-search.json: ${(text.length / 1024).toFixed(1)} KB for the search, against ${(served / 1024).toFixed(0)} KB of Zones served.`);
