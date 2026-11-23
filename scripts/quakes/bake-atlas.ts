/**
 * Bakes the atlas of significant quakes (decision D-EQ, EQ4): NOAA NCEI's Global Significant Earthquake Database, 2150
 * BC to today, with each quake's deaths, damage and tsunami, into public/data/quakes/atlas.json. Read once from NCEI's
 * hazard service, a page at a time; the answers kept in .local/quake-history/ so a second bake reads none again.
 * NOAA's data are in the public domain; NCEI asks to be cited (the credit below).
 *
 * Columns, by NCEI's own ids: the year (negative before the common era), month, day and the time where known, the
 * place, magnitude and depth, deaths (or NCEI's order of them where the count is not known: 1 under 50, 2 51–100,
 * 3 101–1,000, 4 over 1,000), damage in millions of dollars, the intensity, and whether a tsunami came of it.
 *
 *   npm run data:quake-atlas             (add --refresh to ask NCEI again)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = '.local/quake-history';
const OUT = 'public/data/quakes/atlas.json';
const API = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/earthquakes';
const refresh = process.argv.includes('--refresh');

interface NceiQuake {
  id: number; year: number; month?: number; day?: number; hour?: number; minute?: number; second?: number;
  locationName?: string; country?: string; latitude?: number; longitude?: number; eqDepth?: number; eqMagnitude?: number;
  intensity?: number; deaths?: number; deathsTotal?: number; deathsAmountOrder?: number; deathsAmountOrderTotal?: number;
  damageMillionsDollars?: number; damageMillionsDollarsTotal?: number; damageAmountOrder?: number; tsunamiEventId?: number;
  publish?: boolean;
}

async function page(n: number): Promise<{ items: NceiQuake[]; totalPages: number }> {
  const file = `${RAW}/atlas-${n}.json`;
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const response = await fetch(`${API}?minYear=-2150&maxYear=3000&page=${n}`);
  if (!response.ok) throw new Error(`page ${n}: HTTP ${response.status}`);
  const body = await response.text();
  writeFileSync(file, body);
  return JSON.parse(body);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const placeName = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s,:;(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync('public/data/quakes', { recursive: true });
  const first = await page(1);
  const items = [...first.items];
  for (let n = 2; n <= first.totalPages; n += 1) items.push(...(await page(n)).items);
  const kept = items.filter((q) => q.publish !== false && num(q.latitude) !== null && num(q.longitude) !== null && Math.abs(q.latitude as number) <= 90);
  const col = <T>(f: (q: NceiQuake) => T) => kept.map(f);
  const out = {
    credit: 'NCEI/WDS Global Significant Earthquake Database, NOAA National Centers for Environmental Information, doi:10.7289/V5TD9V7K',
    ids: col((q) => q.id),
    year: col((q) => q.year),
    month: col((q) => num(q.month)),
    day: col((q) => num(q.day)),
    // Seconds into the day, where NCEI gives the hour.
    clock: col((q) => (num(q.hour) === null ? null : (q.hour as number) * 3600 + (num(q.minute) ?? 0) * 60 + Math.round(num(q.second) ?? 0))),
    place: col((q) => placeName(q.locationName ?? q.country)),
    lat: col((q) => Math.round((q.latitude as number) * 100) / 100),
    lng: col((q) => Math.round((q.longitude as number) * 100) / 100),
    depth: col((q) => num(q.eqDepth)),
    mag: col((q) => num(q.eqMagnitude)),
    intensity: col((q) => num(q.intensity)),
    // The quake's own and those of what it caused (a tsunami's), as NCEI counts them; its order where no count is known.
    deaths: col((q) => num(q.deathsTotal) ?? num(q.deaths)),
    deathsOrder: col((q) => num(q.deathsAmountOrderTotal) ?? num(q.deathsAmountOrder)),
    damageM: col((q) => num(q.damageMillionsDollarsTotal) ?? num(q.damageMillionsDollars)),
    tsunami: col((q) => num(q.tsunamiEventId) !== null),
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`${kept.length} significant quakes, ${out.year[0]} to ${out.year[out.year.length - 1]} → ${OUT}`);
}

void main();
