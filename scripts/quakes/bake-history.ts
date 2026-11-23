/**
 * Bakes the quakes' history (decision D-EQ, EQ3): USGS's catalogue of magnitude 5 and over since 1900, one file a
 * decade (public/data/quakes/history/m5-1960.json …), so a window in 1964 reads only the 1960s. Read once from USGS's
 * FDSN event service, a decade a query (none past its 20,000 limit), one at a time; the answers kept in
 * .local/quake-history/ so a second bake reads none again. USGS's data are in the public domain.
 *
 * Each file is columns: its quakes' USGS ids, times (s since the epoch), places (to a hundredth of a degree), depths
 * (km) and magnitudes (to a tenth), ordered by time.
 *
 *   npm run data:quake-history            (add --refresh to ask USGS again)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = '.local/quake-history';
const OUT = 'public/data/quakes/history';
const QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const FIRST_DECADE = 1900;
const refresh = process.argv.includes('--refresh');

export interface HistoryDecade {
  decade: number;
  /** Seconds since the epoch: the decade's start, and its end or the bake's moment. */
  from: number;
  until: number;
  credit: string;
  ids: string[];
  t: number[];
  lat: number[];
  lng: number[];
  depth: number[];
  mag: number[];
}

/** One CSV line into its fields, quotes kept apart (USGS's place names hold commas). */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function decadeCsv(decade: number, until: Date): Promise<string> {
  const file = `${RAW}/m5-${decade}.csv`;
  if (!refresh && existsSync(file)) return readFileSync(file, 'utf8');
  const end = new Date(Math.min(Date.UTC(decade + 10, 0, 1), until.getTime()));
  const url = `${QUERY}?format=csv&orderby=time-asc&minmagnitude=5&starttime=${decade}-01-01&endtime=${end.toISOString().slice(0, 19)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${decade}s: HTTP ${response.status}`);
  const csv = await response.text();
  writeFileSync(file, csv);
  return csv;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const now = new Date();
  const lastDecade = Math.floor(now.getUTCFullYear() / 10) * 10;
  let total = 0;
  for (let decade = FIRST_DECADE; decade <= lastDecade; decade += 10) {
    const [header, ...lines] = (await decadeCsv(decade, now)).trim().split('\n');
    const col = Object.fromEntries(fields(header).map((name, i) => [name, i]));
    const out: HistoryDecade = {
      decade,
      from: Date.UTC(decade, 0, 1) / 1000,
      until: Math.min(Date.UTC(decade + 10, 0, 1), now.getTime()) / 1000,
      credit: 'U.S. Geological Survey, ANSS Comprehensive Earthquake Catalog (ComCat), magnitude 5 and over',
      ids: [], t: [], lat: [], lng: [], depth: [], mag: [],
    };
    for (const line of lines) {
      const f = fields(line);
      const t = Date.parse(f[col.time]);
      const lat = Number(f[col.latitude]);
      const lng = Number(f[col.longitude]);
      const mag = Number(f[col.mag]);
      if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(mag)) continue;
      if (f[col.type] && f[col.type] !== 'earthquake') continue;
      const depth = Number(f[col.depth]);
      out.ids.push(f[col.id]);
      out.t.push(Math.round(t / 1000));
      out.lat.push(round(lat, 2));
      out.lng.push(round(lng, 2));
      out.depth.push(Number.isFinite(depth) ? Math.round(depth) : -1);
      out.mag.push(round(mag, 1));
    }
    writeFileSync(`${OUT}/m5-${decade}.json`, `${JSON.stringify(out)}\n`);
    total += out.ids.length;
    console.log(`${decade}s: ${out.ids.length} quakes`);
  }
  console.log(`${total} quakes of magnitude 5 and over since ${FIRST_DECADE} → ${OUT}/`);
}

void main();
