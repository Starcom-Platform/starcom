/**
 * Bakes Mecha Jono's event set (decision D-PW, PW46) into the files Psi Watch reads, one a set under `public/data/`
 * (served as JSON; vercel.json sends other unlisted kinds to the app): its columns as JSON arrays in time order, the
 * times as steps from the one before, places to two decimals (a kilometre), each event's ZSP 2.0 Zone found from its
 * own coordinates (the set names ZSP 1.0's), and the set's kind, licence, credit and its source file's hash, checked
 * against the kit's manifest. Episodes are counted, never their deaths (the kit: never sum them as a toll).
 *
 *   npm run data:psi-events            (sources in .local/psi-events/, copied from Mecha Jono's kit page)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaShapesFrom } from '../../src/features/globe/areas/areaShapes';
import { areaByCode } from '../../src/features/globe/areas/areaRegistry';
import { boundsOf, pointInGeometry } from '../../src/services/geoint/pointInPolygon';
import type { EventSetFile } from '../../src/services/psiWatch/timestream/eventSets';

const source = process.argv[2] ?? '.local/psi-events';
const out = 'public/data';
const DAY_S = 86_400;

const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')) as {
  files: Record<string, { sha256: string; licence: string; credit: string; rows: number; kind: string; time: string; later_events: string }>;
};

function rowsOf(file: string): Record<string, string>[] {
  const text = readFileSync(join(source, file));
  const sha256 = createHash('sha256').update(text).digest('hex');
  const stated = manifest.files[file]?.sha256;
  if (stated !== sha256) throw new Error(`${file}: its sha256 is ${sha256}, the kit's manifest says ${stated}`);
  const [head, ...lines] = text.toString('utf8').trim().split('\n');
  const names = head.split(',');
  const rows = lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [names[i], v])));
  if (rows.length !== manifest.files[file].rows) throw new Error(`${file}: ${rows.length} rows, the manifest says ${manifest.files[file].rows}`);
  return rows;
}

// ZSP 2.0's Zones, as the globe draws them; a retired Zone's ground is the Zones that cover it.
const shapes = areaShapesFrom(JSON.parse(readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
const zones = [...shapes].filter(([code]) => {
  const area = code.startsWith('zone:') ? areaByCode(code) : undefined;
  return area?.kind === 'zone' && area.from !== 'covered';
}).map(([code, outline]) => ({ code, geometry: outline.geometry, box: boundsOf(outline.geometry) }));
function zoneAt(lat: number, lon: number): string | null {
  for (const z of zones) {
    if (lon < z.box[0] || lat < z.box[1] || lon > z.box[2] || lat > z.box[3]) continue;
    if (pointInGeometry(lat, lon, z.geometry)) return z.code;
  }
  return null;
}

const steps = (values: number[]) => values.map((v, i) => (i ? v - values[i - 1] : v));
const at2 = (v: string) => Math.round(Number(v) * 100);

function head(set: EventSetFile['set'], file: string): Omit<EventSetFile, 'rows' | 't' | 'zones'> {
  const m = manifest.files[file];
  // The record's first and last day, as the kit states them ("1989-01-01 to 2025-12-31").
  const span = /(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(m.time);
  if (!span) throw new Error(`${file}: no span in "${m.time}"`);
  return {
    set, kind: m.kind, time: m.time, licence: m.licence, credit: m.credit, laterEvents: m.later_events,
    source: { file, sha256: m.sha256 }, fromMs: Date.parse(`${span[1]}T00:00:00Z`), untilMs: Date.parse(`${span[2]}T00:00:00Z`),
  };
}

function write(name: string, data: EventSetFile) {
  writeFileSync(join(out, name), `${JSON.stringify(data)}\n`);
  console.log(`${name}: ${data.rows} rows, ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
}

function placed(rows: Record<string, string>[], exact: (r: Record<string, string>) => boolean) {
  const table: string[] = [];
  const zone = rows.map((r) => {
    if (!exact(r)) return -1;
    const code = zoneAt(Number(r.lat), Number(r.lon));
    if (!code) return -1;
    let i = table.indexOf(code);
    if (i < 0) { i = table.length; table.push(code); }
    return i;
  });
  return { table, zone };
}

{
  const file = 'ucdp_exact.csv';
  const rows = rowsOf(file).sort((a, b) => a.day.localeCompare(b.day));
  // UCDP's precision 6 and 7 are a country's: placed in no Zone, as the kit has it.
  const { table, zone } = placed(rows, (r) => Number(r.where_prec) <= 5);
  write('psi-events-conflict.json', {
    ...head('conflict', file), rows: rows.length, zones: table,
    t: steps(rows.map((r) => Date.parse(`${r.day}T00:00:00Z`) / 1000 / DAY_S)),
    lat: rows.map((r) => at2(r.lat)), lon: rows.map((r) => at2(r.lon)), zone,
    precision: rows.map((r) => Number(r.where_prec)), violence: rows.map((r) => Number(r.violence)), events: rows.map((r) => Number(r.events)),
  });
}
{
  const file = 'comcat_m55.csv';
  const rows = rowsOf(file).sort((a, b) => Number(a.time_utc) - Number(b.time_utc));
  const { table, zone } = placed(rows, () => true);
  write('psi-events-quakes.json', {
    ...head('quakes', file), rows: rows.length, zones: table,
    t: steps(rows.map((r) => Math.round(Number(r.time_utc)))),
    lat: rows.map((r) => at2(r.lat)), lon: rows.map((r) => at2(r.lon)), zone,
    magnitude: rows.map((r) => Math.round(Number(r.mag) * 10)), depth: rows.map((r) => Math.round(Number(r.depth_km))),
  });
}
{
  const file = 'kp_storm.csv';
  const rows = rowsOf(file).sort((a, b) => a.first_day.localeCompare(b.first_day));
  write('psi-events-storms.json', {
    ...head('storms', file), rows: rows.length, zones: [],
    t: steps(rows.map((r) => Date.parse(`${r.first_day}T00:00:00Z`) / 1000 / DAY_S)),
    days: rows.map((r) => Number(r.days)), maxKp: rows.map((r) => Math.round(Number(r.max_kp) * 3)),
  });
}
