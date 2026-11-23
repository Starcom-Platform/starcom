#!/usr/bin/env node
/**
 * France's five overseas regions as territories of their own (Mecha Jono's note of 7 Nov 2026; the owner's choice of
 * 8 Nov: "separate the five").
 *
 * Natural Earth's countries file draws French Guiana, and at the finer levels Réunion, Martinique and Guadeloupe,
 * inside France's shape, and Mayotte nowhere. A report placed at one (`gf`, `gp`, `mq`, `re`, `yt`, each its own ISO
 * 3166-1 code) was never drawn, and "fr" read as more than the reports on The Record mean by it: every one naming it
 * on 8 Nov was about metropolitan France.
 *
 * For each detail level (world-territories-lod0/1/2.geojson, and world-territories.geojson, a copy of lod1):
 *   - France keeps its metropolitan parts (the mainland, Corsica and the coast's islands), their vertices untouched;
 *   - each part lying in one of the five becomes that region's feature, its vertices untouched, so French Guiana's
 *     edges with Brazil and Suriname stay what they were;
 *   - a region the level does not draw at all gets its largest island from Natural Earth's 1:50m map units
 *     (data/raw/geopolitical/ne_50m_admin_0_map_units.france.geojson), cut to as few points as the level gives islands
 *     of its size (Mauritius, Saint Lucia), as mapshaper's keep-shapes would have kept it;
 *   - each region carries its map unit's own fields, with ADMIN its own name, ISO_A2 its own code and ADM0_A3 its own
 *     unit code (GUF, GLP, MTQ, REU, MYT), as the territory index, the meshes and the colours read them.
 * Every other feature is left as it is. Run once; a level already split is left alone.
 *
 * Usage: node scripts/geopolitical/split-france-overseas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'public/geopolitical');
const units = JSON.parse(fs.readFileSync(path.join(root, 'data/raw/geopolitical/ne_50m_admin_0_map_units.france.geojson'), 'utf8')).features;

/** The five, by the map unit's GU_A3. */
const REGIONS = ['GUF', 'GLP', 'MTQ', 'REU', 'MYT'];
/** As many points as the level gives an island of this size (a closed ring: three corners and the first again, at least). */
const ISLAND_POINTS = { 0: 5, 1: 5, 2: 6 };

const polygonsOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
const bbox = (ring) => ring.reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
const centre = (ring) => { const [a, b, c, d] = bbox(ring); return [(a + c) / 2, (b + d) / 2]; };
const within = ([x, y], [a, b, c, d], pad = 0.5) => x >= a - pad && x <= c + pad && y >= b - pad && y <= d + pad;
const area = (ring) => Math.abs(ring.slice(1).reduce((s, [x2, y2], i) => s + ring[i][0] * y2 - x2 * ring[i][1], 0)) / 2;
const asGeometry = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });

/** Visvalingam–Whyatt: drop the corner making the smallest triangle until `keep` points remain (the ring stays closed). */
function cut(ring, keep) {
  const open = ring.slice(0, -1);
  while (open.length > keep - 1) {
    let least = Infinity; let at = 0;
    for (let i = 0; i < open.length; i += 1) {
      const a = open[(i - 1 + open.length) % open.length]; const b = open[i]; const c = open[(i + 1) % open.length];
      const t = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      if (t < least) { least = t; at = i; }
    }
    open.splice(at, 1);
  }
  return [...open, open[0]];
}

const unitBoxes = units.map((u) => ({ u, box: polygonsOf(u.geometry).map((p) => bbox(p[0])).reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])]) }));
/** The map unit a part of France's shape lies in, by where its middle is. */
const unitOf = (ring) => unitBoxes.find(({ box }) => within(centre(ring), box))?.u ?? null;

function regionFeature(unit, polys, keys) {
  const p = unit.properties;
  const properties = Object.fromEntries(keys.map((k) => [k, p[k] ?? null]));
  Object.assign(properties, { ADMIN: p.NAME, ISO_A2: p.ISO_A2_EH, ADM0_A3: p.GU_A3 });
  return { type: 'Feature', geometry: asGeometry(polys), properties };
}

function splitLevel(file, lod) {
  const full = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (data.features.some((f) => REGIONS.includes(f.properties?.ADM0_A3))) {
    console.log(`${file}: already split, left alone`);
    return;
  }
  const at = data.features.findIndex((f) => f.properties?.ADM0_A3 === 'FRA');
  const france = data.features[at];
  const keys = Object.keys(france.properties);
  const parts = new Map(REGIONS.map((code) => [code, []]));
  const home = [];
  for (const poly of polygonsOf(france.geometry)) {
    const unit = unitOf(poly[0]);
    const code = unit?.properties.GU_A3;
    if (code && parts.has(code)) parts.get(code).push(poly);
    else home.push(poly);
  }
  const said = [];
  const regions = REGIONS.map((code) => {
    const unit = units.find((u) => u.properties.GU_A3 === code);
    let polys = parts.get(code);
    if (!polys.length) {
      const largest = polygonsOf(unit.geometry).map((p) => p[0]).sort((a, b) => area(b) - area(a))[0];
      polys = [[cut(largest, ISLAND_POINTS[lod])]];
      said.push(`${code} added (${polys[0][0].length} points)`);
    } else said.push(`${code} from France (${polys.length} part${polys.length > 1 ? 's' : ''})`);
    return regionFeature(unit, polys, keys);
  });
  data.features.splice(at, 1, { type: 'Feature', geometry: asGeometry(home), properties: france.properties }, ...regions);
  // As mapshaper wrote it: one feature a line, so a diff shows France's line and the five new ones only.
  fs.writeFileSync(full, `{"type":"FeatureCollection", "features": [\n${data.features.map((f) => JSON.stringify(f)).join(',\n')}\n]}`);
  console.log(`${file}: France keeps ${home.length} parts; ${said.join('; ')}`);
}

splitLevel('world-territories-lod0.geojson', 0);
splitLevel('world-territories-lod1.geojson', 1);
splitLevel('world-territories-lod2.geojson', 2);
splitLevel('world-territories.geojson', 1);
