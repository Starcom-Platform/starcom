#!/usr/bin/env node
/**
 * Writes src/geopolitical/theme/territoryColours.ts: a colour slot for every territory,
 * no two neighbours alike (decision K5, TS7), each keeping the slot it was last written with. The neighbour graph is read from all three
 * detail levels; a pair that borders at any of them counts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { territoryNeighbours, colourTerritories, clashes, colourModuleSource } from './lib/territoryNeighbours.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (lod) => JSON.parse(fs.readFileSync(path.join(root, `public/geopolitical/world-territories-lod${lod}.geojson`), 'utf8'));
const neighbours = territoryNeighbours(read(0), read(1), read(2));
const out = path.join(root, 'src/geopolitical/theme/territoryColours.ts');
// The slots last written: each territory keeps its own, and only a new one is coloured.
const kept = fs.existsSync(out)
  ? Object.fromEntries([...fs.readFileSync(out, 'utf8').matchAll(/\b([A-Z0-9]{3}): (\d)\b/g)].map(([, code, s]) => [code, Number(s)]))
  : {};
const slots = colourTerritories(neighbours, kept);
const bad = clashes(neighbours, slots);
if (bad.length) {
  console.error(`colour-territories: neighbours share a colour: ${bad.join(' ')}`);
  process.exit(1);
}
fs.writeFileSync(out, colourModuleSource(slots));
const counts = [0, 0, 0, 0];
for (const s of Object.values(slots)) counts[s]++;
const pairs = [...neighbours.values()].reduce((n, set) => n + set.size, 0) / 2;
console.log(`colour-territories: ${Object.keys(slots).length} territories, ${pairs} neighbour pairs, slots used ${counts.join('/')} -> ${path.relative(root, out)}`);
