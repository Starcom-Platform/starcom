/**
 * Bakes the ψ field's static base (decision D-PW, PW57, PW78): three of G's four bands on the 2° grid, each
 * exp(−d²/2w²) of the distance to its feature, w 350 km. The fourth, the core's null-flux line, moves with the year
 * drawn (PW80) and is computed in the browser.
 *   - the geoid's persistence ridges and valleys, EGM96 to degree 12 less GRS80's normal field, on the 41,253-node
 *     Fibonacci mesh, the 30 most persistent pairs over 0.05 m, sampled every half degree;
 *   - the spreading steps of PB2002 (classes OSR and CRB), each step's start;
 *   - the coasts of Natural Earth's 1:110m land, every second vertex of each outer ring, Antarctica's closing
 *     vertices at 90°S left out.
 * Each input is fetched once from its publisher into .local/psi-field/. The arcs are checked against the experiment's
 * own: 13 ridges and 16 valleys, the most persistent 62.6, 28.9 and 17.5 m, and 41.4, 37.3 and 22.1 m.
 *
 * Usage: npm run data:psi-base
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { band, densify, PSI_GRID, type LatLon } from '../../src/services/psiWatch/psiField/grid';
import { geoidAt, readEgm96 } from '../../src/services/psiWatch/psiField/geoid';
import { fibonacciMesh, skeleton } from '../../src/services/psiWatch/psiField/skeleton';

const DIR = '.local/psi-field';
const OUT = 'public/data/psi-base.json';
const BAND_KM = 350;
const SOURCES = {
  egm96: {
    name: 'EGM96 (NASA GSFC and NGA, Lemoine et al. 1998), to degree 36 as the Generic Mapping Tools serve it',
    url: 'https://raw.githubusercontent.com/GenericMappingTools/gmtserver-admin/master/cache/EGM96_to_36.txt',
    file: 'EGM96_to_36.txt',
    licence: 'US Government public domain',
  },
  pb2002: {
    name: 'PB2002 plate boundary steps (Bird 2003, G³ 4(3) 1027), as converted by Hugo Ahlenius (Nordpil)',
    url: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_steps.json',
    file: 'PB2002_steps.json',
    licence: 'Open Data Commons Attribution 1.0',
  },
  land: {
    name: 'Natural Earth 1:110m land',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson',
    file: 'ne_110m_land.geojson',
    licence: 'public domain',
  },
} as const;

async function input(key: keyof typeof SOURCES): Promise<string> {
  const { url, file } = SOURCES[key];
  const path = `${DIR}/${file}`;
  if (!existsSync(path)) {
    mkdirSync(DIR, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return readFileSync(path, 'utf8');
}

const t0 = Date.now();
const mesh = fibonacciMesh();
const geoid = geoidAt(readEgm96(await input('egm96')), mesh.units);
const ridges = skeleton(geoid, mesh, 1, 30, 0.05);
const valleys = skeleton(geoid, mesh, -1, 30, 0.05);
const top = (arcs: typeof ridges) => [...new Set(arcs.map((a) => a.persistence))].slice(0, 3).map((p) => p.toFixed(1)).join(', ');
console.log(`bake-psi-base: mesh ${mesh.units.length / 3} nodes, ${mesh.edges} edges, spacing ${mesh.spacing.toFixed(2)}°; `
  + `ridges ${ridges.length} (${top(ridges)} m), valleys ${valleys.length} (${top(valleys)} m)`);
if (ridges.length !== 13 || valleys.length !== 16 || top(ridges) !== '62.6, 28.9, 17.5' || top(valleys) !== '41.4, 37.3, 22.1') {
  throw new Error('The persistence arcs differ from the experiment\'s: 13 ridges (62.6, 28.9, 17.5 m), 16 valleys (41.4, 37.3, 22.1 m)');
}

const geoidPoints = [...ridges, ...valleys].flatMap((a) => densify(a.points));
const pb = JSON.parse(await input('pb2002')) as { features: Array<{ properties: { STEPCLASS: string; STARTLAT: number; STARTLONG: number } }> };
const spreadingPoints: LatLon[] = pb.features
  .filter((f) => f.properties.STEPCLASS === 'OSR' || f.properties.STEPCLASS === 'CRB')
  .map((f) => [f.properties.STARTLAT, f.properties.STARTLONG]);
const land = JSON.parse(await input('land')) as { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };
const coastPoints: LatLon[] = [];
for (const f of land.features) {
  const polygons = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
  for (const polygon of polygons) {
    polygon[0].forEach(([x, y], i) => { if (i % 2 === 0 && Math.abs(y) < 89.9) coastPoints.push([y, x]); });
  }
}

const rounded = (values: Float64Array) => Array.from(values, (v) => Math.round(v * 1e4) / 1e4);
const arcs = (list: typeof ridges) => list.map((a) => [Math.round(a.persistence * 100) / 100, a.points]);
writeFileSync(OUT, `${JSON.stringify({
  about: 'The ψ field\'s static base: three of its four bands on the 2° grid, exp(−d²/2w²) of the distance to each feature, '
    + 'and the geoid\'s persistence arcs (persistence in metres, then [lat, lon] from the saddle).',
  sources: Object.values(SOURCES).map(({ name, url, licence }) => ({ name, url, licence })),
  grid: PSI_GRID,
  bandKm: BAND_KM,
  bands: {
    geoid: rounded(band(geoidPoints, BAND_KM)),
    spreading: rounded(band(spreadingPoints, BAND_KM)),
    coasts: rounded(band(coastPoints, BAND_KM)),
  },
  arcs: { ridges: arcs(ridges), valleys: arcs(valleys) },
})}\n`);
console.log(`bake-psi-base: bands from ${geoidPoints.length} geoid, ${spreadingPoints.length} spreading and ${coastPoints.length} `
  + `coast samples → ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
