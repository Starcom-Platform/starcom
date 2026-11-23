#!/usr/bin/env node
/**
 * Writes src/geopolitical/theme/territoryLabels.ts: Natural Earth's name, label
 * point, rank and zoom for every territory (decision K5, step 4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelModuleSource, labelRows } from './lib/territoryLabels.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(fs.readFileSync(path.join(root, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8'));
const rows = labelRows(collection);
const out = path.join(root, 'src/geopolitical/theme/territoryLabels.ts');
fs.writeFileSync(out, labelModuleSource(rows));
console.log(`label-territories: ${rows.length} names, ${rows.filter((r) => r.lines.length > 1).length} on two lines -> ${path.relative(root, out)}`);
