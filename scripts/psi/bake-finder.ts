/**
 * Bakes the Finder's place control (decision D-PW, PW61, PW70, PW75): every ZSP 2.0 Zone's resonance with the archetype "a
 * Zone on a plate boundary", the share of its area within 150 km of a PB2002 plate boundary, beside its area and the
 * earthquakes of M5.5 and up it held, from the event set baked for Echoes, outside the years held back for sealed tests. On a half-degree grid: each cell's Zone
 * from the areas the globe draws, each cell within 150 km of a boundary (its middle, by the haversine, from points
 * along the boundaries every tenth of a degree), each cell's area exact on the sphere.
 *
 *   npm run data:psi-finder        (PB2002 in .local/zsp2-data/pb2002/, as the ZSP 2.0 bake used it)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { areaShapesFrom } from '../../src/features/globe/areas/areaShapes';
import { areaByCode } from '../../src/features/globe/areas/areaRegistry';
import { boundsOf, pointInGeometry } from '../../src/services/geoint/pointInPolygon';
import type { FinderPlatesFile } from '../../src/services/psiWatch/finder';
import { WITHHELD } from '../../src/services/psiWatch/timestream/withheld';

const PB2002 = '.local/zsp2-data/pb2002/PB2002_boundaries.json';
const WITHIN_KM = 150;
const CELL = 0.5;
const EARTH_KM = 6371.0088;
const ROWS = 180 / CELL;
const COLS = 360 / CELL;
const rad = (d: number) => (d * Math.PI) / 180;

const shapes = areaShapesFrom(JSON.parse(readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
const zones = [...shapes].filter(([code]) => {
  const area = code.startsWith('zone:') ? areaByCode(code) : undefined;
  return area?.kind === 'zone' && area.from !== 'covered';
}).map(([code, outline]) => ({ code, geometry: outline.geometry, box: boundsOf(outline.geometry) }));

// Each cell's Zone, by its middle.
const zoneOf = new Int16Array(ROWS * COLS).fill(-1);
for (let row = 0; row < ROWS; row++) {
  const lat = -90 + (row + 0.5) * CELL;
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) * CELL;
    const i = zones.findIndex((z) => lon >= z.box[0] && lat >= z.box[1] && lon <= z.box[2] && lat <= z.box[3] && pointInGeometry(lat, lon, z.geometry));
    zoneOf[row * COLS + col] = i;
  }
}

// Each cell within 150 km of a boundary, from points along the boundaries a tenth of a degree apart.
const near = new Uint8Array(ROWS * COLS);
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};
const reachLat = WITHIN_KM / 111.19;
const boundaries = JSON.parse(readFileSync(PB2002, 'utf8')) as { features: { geometry: { type: string; coordinates: number[][] | number[][][] } }[] };
let points = 0;
for (const f of boundaries.features) {
  const lines = (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][];
  for (const line of lines) {
    for (let k = 1; k < line.length; k++) {
      const [lon0, lat0] = line[k - 1];
      const [lon1, lat1] = line[k];
      const dLon = ((lon1 - lon0 + 540) % 360) - 180;
      const steps = Math.max(1, Math.ceil(Math.hypot(dLon, lat1 - lat0) / 0.1));
      for (let s = 0; s <= steps; s++) {
        const lat = lat0 + ((lat1 - lat0) * s) / steps;
        const lon = ((lon0 + (dLon * s) / steps + 540) % 360) - 180;
        points++;
        const reachLon = Math.min(180, reachLat / Math.max(0.01, Math.cos(rad(lat))));
        for (let row = Math.max(0, Math.floor((lat - reachLat + 90) / CELL)); row <= Math.min(ROWS - 1, Math.floor((lat + reachLat + 90) / CELL)); row++) {
          const cLat = -90 + (row + 0.5) * CELL;
          for (let c = Math.floor((lon - reachLon + 180) / CELL); c <= Math.floor((lon + reachLon + 180) / CELL); c++) {
            const col = ((c % COLS) + COLS) % COLS;
            const i = row * COLS + col;
            if (near[i]) continue;
            if (haversine(lat, lon, cLat, -180 + (col + 0.5) * CELL) <= WITHIN_KM) near[i] = 1;
          }
        }
      }
    }
  }
}

// Each Zone's area and its share near a boundary; its earthquakes from the baked set.
const cellKm2 = (row: number) => EARTH_KM ** 2 * rad(CELL) * (Math.sin(rad(-90 + (row + 1) * CELL)) - Math.sin(rad(-90 + row * CELL)));
const area = new Float64Array(zones.length);
const nearArea = new Float64Array(zones.length);
for (let row = 0; row < ROWS; row++) {
  const a = cellKm2(row);
  for (let col = 0; col < COLS; col++) {
    const z = zoneOf[row * COLS + col];
    if (z < 0) continue;
    area[z] += a;
    if (near[row * COLS + col]) nearArea[z] += a;
  }
}
const quakes = JSON.parse(readFileSync('public/data/psi-events-quakes.json', 'utf8')) as { zones: string[]; zone: number[]; t: number[]; rows: number; fromMs: number; untilMs: number; credit: string };
// The years Mecha Jono holds back for their sealed tests stay out of every count (PW75).
const held = WITHHELD.quakes;
const quakesIn = new Map<string, number>();
let at = 0;
quakes.zone.forEach((z, i) => {
  at += quakes.t[i] * 1000;
  if (z < 0 || held.some((h) => at >= h.fromMs && at < h.untilMs)) return;
  quakesIn.set(quakes.zones[z], (quakesIn.get(quakes.zones[z]) ?? 0) + 1);
});

const out: FinderPlatesFile = {
  archetype: 'plate-boundary',
  withinKm: WITHIN_KM,
  cellDeg: CELL,
  quakesFromMs: quakes.fromMs,
  quakesUntilMs: quakes.untilMs,
  heldBack: held.map((h) => h.years).join(', '),
  credit: {
    boundaries: 'Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems 4(3); GeoJSON by Hugo Ahlenius, Nordpil (fraxen/tectonicplates), Open Data Commons Attribution License',
    quakes: quakes.credit,
  },
  zones: zones.map((z, i) => ({ code: z.code, share: area[i] ? Math.round((nearArea[i] / area[i]) * 1000) / 1000 : 0, areaKm2: Math.round(area[i]), quakes: quakesIn.get(z.code) ?? 0 }))
    .filter((z) => z.areaKm2 > 0)
    .sort((a, b) => a.code.localeCompare(b.code)),
};
writeFileSync('public/data/psi-finder-plates.json', `${JSON.stringify(out)}\n`);
const placed = out.zones.reduce((n, z) => n + z.quakes, 0);
console.log(`psi-finder-plates.json: ${out.zones.length} Zones, ${points} boundary points, ${placed} of ${quakes.rows} quakes in a Zone`);
