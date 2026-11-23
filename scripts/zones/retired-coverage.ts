/**
 * Which ZSP 2.0 Zones now hold each 1.0 Zone the swap retired (decision D-ZR, ZR8, ZR28): each 1.0 Zone sampled on a
 * grid (0.1°, 0.5° for one the size of the Ring of Fire), each sample placed in the served partition, weighted by
 * its area. A Zone covers a retired one when it holds 5% of it, or 1% of it with a tenth of the Zone itself inside
 * it; so a retired Zone is drawn as the Zones its place is made of (Niamey's Leo–Man Zone for the Sahel), not every
 * Zone it grazes (the Nile's for the Sahel, the open Pacific's for the Ring of Fire). Prints the
 * lists build-terrae.ts writes into the manifest (RETIRED), largest share first.
 *
 *   npx tsx scripts/zones/retired-coverage.ts
 *
 * Reads the 1.0 documents from the copy the 1.0 tests keep (src/geopolitical/zones/__tests__/zsp-1.0/).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { area } from '@turf/turf';
import { indexFrom, placeAt } from '../../src/geopolitical/zones/zsp';

const SERVED = 'public/geopolitical/zones';
const FIRST = 'src/geopolitical/zones/__tests__/zsp-1.0';
const ALONE = 0.05;
const SHARE = 0.01;
const OF_ZONE = 0.1;

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const served = read(join(SERVED, 'manifest.json'));
const index = indexFrom(served, served.containers.map((c: { file: string }) => read(join(SERVED, c.file))));
const zoneOf = new Map<string, string>();
const km2Of = new Map<string, number>();
for (const z of index.zones) {
  km2Of.set(z.root.id, area({ type: 'Feature', properties: {}, geometry: z.root.geometry }) / 1e6);
  for (const p of [z.root, ...z.places]) zoneOf.set(p.id, z.root.id);
}

const first = read(join(FIRST, 'manifest.json')) as { zones: Array<{ id: string; name: string; file: string }> };
for (const entry of first.zones) {
  if (index.byId.has(entry.id)) continue; // kept: a 2.0 Zone of its own
  const one = indexFrom(first, [read(join(FIRST, entry.file))]);
  const [w, s, e, n] = one.zones[0].root.bbox;
  const step = (e - w) * (n - s) > 2000 ? 0.5 : 0.1;
  const held = new Map<string, number>();
  let total = 0;
  for (let lat = s + step / 2; lat < n; lat += step) {
    const km2 = (step * 111.32) ** 2 * Math.cos((lat * Math.PI) / 180);
    for (let lon = w + step / 2; lon < e; lon += step) {
      if (!placeAt(one, lat, lon)) continue;
      total += km2;
      const place = placeAt(index, lat, lon);
      const zone = place && zoneOf.get(place.id);
      if (zone) held.set(zone, (held.get(zone) ?? 0) + km2);
    }
  }
  const covering = [...held.entries()]
    .filter(([zone, km2]) => km2 / total >= ALONE || (km2 / total >= SHARE && km2 / km2Of.get(zone)! >= OF_ZONE))
    .sort((a, b) => b[1] - a[1]);
  console.log(`${entry.id} (${Math.round(total).toLocaleString('en')} km²): ${covering.length} ${covering.length === 1 ? 'Zone holds' : 'Zones hold'} ${(100 * covering.reduce((t, [, k]) => t + k, 0) / total).toFixed(0)}% of it`);
  for (const [zone, km2] of covering) console.log(`  ${zone}  ${(100 * km2 / total).toFixed(1)}% of it, ${(100 * km2 / km2Of.get(zone)!).toFixed(0)}% of the Zone`);
}
