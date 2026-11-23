#!/usr/bin/env node
/**
 * The US state outlines Starcom serves (public/geopolitical/us-states-50m.geojson),
 * cut from Natural Earth's public-domain admin-1 set at 1:50m.
 *
 * Raver Watch draws an alert about a state (`jurisdiction: us-tx`) as that
 * state's outline (decision RW4, globe record section 19). The territory index
 * holds countries only, and widening a state's alert to its whole country would
 * claim more than the publisher did, so the states are a file of their own.
 * Loaded only when an item names one.
 *
 * Kept: the 50 states and DC, each with its code in the form Raver Watch uses
 * (`us-tx`) and its name; coordinates to three decimals, about 110 m, far finer
 * than a faint outline at globe scale needs. Everything else in the source is
 * dropped.
 *
 * Usage: node scripts/build-us-states.mjs <ne_50m_admin_1_states_provinces.geojson>
 * Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_1_states_provinces.geojson
 * Then record the printed sha256 in public/geopolitical/manifest.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-us-states.mjs <ne_50m_admin_1_states_provinces.geojson>');
  process.exit(2);
}
const OUT = path.resolve('public/geopolitical/us-states-50m.geojson');

const round = (coords) => (Array.isArray(coords[0])
  ? coords.map(round)
  : [Math.round(coords[0] * 1000) / 1000, Math.round(coords[1] * 1000) / 1000]);

const { features } = JSON.parse(fs.readFileSync(source, 'utf8'));
const states = features
  .filter((f) => f.properties?.adm0_a3 === 'USA' && /^US-[A-Z]{2}$/.test(f.properties?.iso_3166_2 ?? ''))
  .map((f) => ({
    type: 'Feature',
    properties: { code: f.properties.iso_3166_2.toLowerCase(), name: f.properties.name },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  }))
  .sort((a, b) => a.properties.code.localeCompare(b.properties.code));

const text = JSON.stringify({ type: 'FeatureCollection', features: states });
fs.writeFileSync(OUT, text);
console.log(`${states.length} states, ${text.length} bytes, sha256 ${crypto.createHash('sha256').update(text).digest('hex')}`);
