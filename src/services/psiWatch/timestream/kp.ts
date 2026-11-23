/**
 * The field lane's Kp (decision D-PW, PW42, PW51): measured behind the cursor and forecast ahead of it. GFZ Potsdam's
 * 3-hourly Kp since 1932, definitive and preliminary, baked into the build (`scripts/psi/bake-kp.ts`, CC BY 4.0, its
 * credit in the file);
 * NOAA's Space Weather Prediction Center for the days since, its estimated planetary K of the last 30 days and its
 * 3-hourly values observed, estimated and predicted three days ahead; then its 27-day outlook's largest Kp of each
 * day (public domain, NOAA NWS). Each value keeps which it is. Where two give a slot, GFZ's stands, then NOAA's
 * observed over its estimated, over its predicted.
 *
 * Wider views change its form, as the owner chose (PW51): 3-hourly values to two months, each day's largest to three
 * years, the storm days alone (Kp 5 or more, as Mecha Jono's event set counts them) to a decade, then storms a year,
 * a storm's consecutive days one storm.
 */

/** NOAA SWPC's 3-hourly Kp, a week back and three days ahead (public domain, NOAA NWS). */
export const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
/** NOAA SWPC's 27-day outlook: each day's 10.7 cm flux, A index and largest Kp. */
export const KP_OUTLOOK_URL = 'https://services.swpc.noaa.gov/text/27-day-outlook.txt';
/** NOAA SWPC's last 30 days of geomagnetic data, its estimated planetary K among them. */
export const KP_DAILY_URL = 'https://services.swpc.noaa.gov/text/daily-geomagnetic-indices.txt';
/** GFZ's Kp since 1932, as baked into the build. */
export const KP_BAKE_URL = '/data/psi-kp-gfz.json';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const KP_SLOT_MS = 3 * HOUR;
/** A storm day's largest Kp, at least: G1 and up, as Mecha Jono's storm days count. */
export const STORM_KP = 5;
const NONE = 255;

/** Which a value is, best first: where two sources give a slot, the better stands. */
export const KP_BASES = ['definitive', 'preliminary', 'observed', 'estimated', 'predicted', 'outlook'] as const;
export type KpBasis = (typeof KP_BASES)[number];

export interface KpSpan {
  /** The span the value holds for, ms: three hours, or a UTC day for the outlook. */
  fromMs: number;
  untilMs: number;
  kp: number;
  basis: KpBasis;
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** The 3-hourly forecast's rows, each its three hours from its time tag (UTC, as SWPC writes it without a zone). */
export function readKpForecast(json: unknown): KpSpan[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((row) => {
    const r = row as { time_tag?: unknown; kp?: unknown; observed?: unknown };
    const at = typeof r.time_tag === 'string' ? Date.parse(`${r.time_tag}Z`) : NaN;
    const kp = Number(r.kp);
    const basis = r.observed === 'observed' || r.observed === 'estimated' || r.observed === 'predicted' ? r.observed : null;
    return Number.isFinite(at) && Number.isFinite(kp) && kp >= 0 && basis ? [{ fromMs: at, untilMs: at + KP_SLOT_MS, kp, basis }] : [];
  });
}

/** The 27-day outlook's days: `2026 Oct 31      84          30          5`, the last figure the day's largest Kp. */
export function readKpOutlook(text: string): KpSpan[] {
  return text.split('\n').flatMap((line) => {
    const m = /^(\d{4}) ([A-Z][a-z]{2}) (\d{2})\s+\d+\s+\d+\s+(\d+(?:\.\d+)?)\s*$/.exec(line.trim());
    if (!m || MONTHS[m[2]] === undefined) return [];
    const fromMs = Date.UTC(Number(m[1]), MONTHS[m[2]], Number(m[3]));
    return [{ fromMs, untilMs: fromMs + DAY, kp: Number(m[4]), basis: 'outlook' as const }];
  });
}

/**
 * The last 30 days' estimated planetary K, the line's last eight figures: `2026 10 27 … 6   1.67  2.67 … -1.00`,
 * -1 where the day's three hours have not come yet.
 */
export function readKpDaily(text: string): KpSpan[] {
  return text.split('\n').flatMap((line) => {
    const m = /^(\d{4}) (\d{2}) (\d{2})\s/.exec(line);
    if (!m) return [];
    const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const figures = line.trim().split(/\s+/).slice(-8).map(Number);
    if (figures.length !== 8) return [];
    return figures.flatMap((kp, i) => (Number.isFinite(kp) && kp >= 0
      ? [{ fromMs: day + i * KP_SLOT_MS, untilMs: day + (i + 1) * KP_SLOT_MS, kp, basis: 'estimated' as const }] : []));
  });
}

/** GFZ's Kp as baked: its credit, the first slot, a character a slot, and where its preliminary values begin. */
export interface KpBake {
  source: string;
  licence: string;
  credit: string;
  startMs: number;
  /** A character a slot from KP_ALPHABET: its place there Kp in thirds, the last where none. */
  kp: string;
  /** The first slot GFZ has not yet made definitive; every one after it is preliminary too. */
  preliminaryFrom: number;
}

/**
 * Kp's 28 thirds, 0 to 9, then "none": punctuation only, never a letter or a digit, so no run of slots can ever read as
 * a credential to the bundle's secret guard (a run of digits and a colon once read as a Telegram token).
 */
export const KP_ALPHABET = "!#$%&'()*+,-./:;<=>?@[]^`{|}~";
const NONE_CHAR = KP_ALPHABET.length - 1;
const GFZ_CREDIT = 'Matzka, J., Stolle, C., Yamazaki, Y., Bronkalla, O. and Morschhauser, A. (2021), The geomagnetic Kp index and '
  + 'derived indices of geomagnetic activity, Space Weather, https://doi.org/10.1029/2020SW002641; GFZ Data Services, https://doi.org/10.5880/Kp.0001';

/** The bake's slots, or null for a file that is not one. */
export function readKpBake(json: unknown): { startMs: number; kp3: Uint8Array; preliminary: Uint8Array } | null {
  const b = json as Partial<KpBake> | null;
  if (!b || typeof b.kp !== 'string' || typeof b.startMs !== 'number') return null;
  const kp3 = new Uint8Array(b.kp.length).fill(NONE);
  const preliminary = new Uint8Array(b.kp.length);
  const from = typeof b.preliminaryFrom === 'number' ? b.preliminaryFrom : b.kp.length;
  for (let i = 0; i < b.kp.length; i++) {
    const third = KP_ALPHABET.indexOf(b.kp[i]);
    if (third < 0 || third >= NONE_CHAR) continue;
    kp3[i] = third;
    preliminary[i] = i >= from ? 1 : 0;
  }
  return { startMs: b.startMs, kp3, preliminary };
}

/** The bake from GFZ's file: `1932 01 01 00.0 01.50 0.00000 0.06250  3.333   18 1`, its last figure 1 where definitive. */
export function bakeKp(text: string): KpBake {
  const rows = text.split('\n').filter((line) => /^\d{4} /.test(line)).map((line) => line.trim().split(/\s+/));
  const slotOf = (r: string[]) => Date.UTC(Number(r[0]), Number(r[1]) - 1, Number(r[2]), Number(r[3]));
  const startMs = slotOf(rows[0]);
  const chars = new Array<string>(Math.round((slotOf(rows[rows.length - 1]) - startMs) / KP_SLOT_MS) + 1).fill(KP_ALPHABET[NONE_CHAR]);
  let preliminaryFrom = chars.length;
  for (const r of rows) {
    const slot = Math.round((slotOf(r) - startMs) / KP_SLOT_MS);
    if (r[9] === '0') preliminaryFrom = Math.min(preliminaryFrom, slot);
    const kp = Number(r[7]);
    if (kp >= 0) chars[slot] = KP_ALPHABET[Math.round(kp * 3)];
  }
  return { source: 'GFZ Potsdam, Kp since 1932 (Kp_ap_since_1932.txt)', licence: 'CC BY 4.0', credit: GFZ_CREDIT, startMs, kp: chars.join(''), preliminaryFrom };
}

/** Every slot's Kp from the sources merged, the better basis standing, and the outlook's days after. */
export interface KpRecord {
  startMs: number;
  /** Kp in thirds a slot; 255 where none. */
  kp3: Uint8Array;
  /** An index into KP_BASES a slot. */
  basis: Uint8Array;
  outlook: KpSpan[];
}

export function kpRecord(bake: ReturnType<typeof readKpBake>, recent: readonly KpSpan[], outlook: readonly KpSpan[]): KpRecord {
  const slots = recent.filter((s) => s.untilMs - s.fromMs === KP_SLOT_MS);
  const starts = [bake?.startMs ?? Infinity, ...slots.map((s) => s.fromMs)];
  const startMs = Math.min(...starts);
  if (!Number.isFinite(startMs)) return { startMs: 0, kp3: new Uint8Array(0), basis: new Uint8Array(0), outlook: [...outlook] };
  const bakeEnd = bake ? bake.startMs + bake.kp3.length * KP_SLOT_MS : -Infinity;
  const endMs = Math.max(bakeEnd, ...slots.map((s) => s.untilMs));
  const count = Math.round((endMs - startMs) / KP_SLOT_MS);
  const kp3 = new Uint8Array(count).fill(NONE);
  const basis = new Uint8Array(count).fill(KP_BASES.length);
  if (bake) {
    const offset = Math.round((bake.startMs - startMs) / KP_SLOT_MS);
    for (let i = 0; i < bake.kp3.length; i++) {
      if (bake.kp3[i] === NONE) continue;
      kp3[offset + i] = bake.kp3[i];
      basis[offset + i] = bake.preliminary[i] ? 1 : 0;
    }
  }
  for (const s of slots) {
    const i = Math.round((s.fromMs - startMs) / KP_SLOT_MS);
    const rank = KP_BASES.indexOf(s.basis);
    if (i < 0 || i >= count || rank >= basis[i]) continue;
    kp3[i] = Math.round(s.kp * 3);
    basis[i] = rank;
  }
  // The outlook from where the 3-hourly values end, the first of its days clipped there.
  let last = startMs;
  for (let i = count - 1; i >= 0; i--) if (kp3[i] !== NONE) { last = startMs + (i + 1) * KP_SLOT_MS; break; }
  const after = outlook.filter((d) => d.untilMs > last).map((d) => (d.fromMs < last ? { ...d, fromMs: last } : d));
  return { startMs, kp3, basis, outlook: after };
}

/** What a view shows of Kp, by its span. */
export type KpLod = 'slots' | 'days' | 'stormDays' | 'years';
const YEAR = 365.25 * DAY;
export const kpLod = (spanMs: number): KpLod => (spanMs <= 61 * DAY ? 'slots' : spanMs <= 3 * YEAR ? 'days' : spanMs <= 10 * YEAR ? 'stormDays' : 'years');

/** One bar of the lane: a slot's or a day's Kp, or a year's storms. */
export interface KpBar {
  fromMs: number;
  untilMs: number;
  /** The slot's Kp, or the day's largest. */
  kp?: number;
  /** A year's storms. */
  storms?: number;
  basis: KpBasis;
}

const utcDay = (ms: number) => Math.floor(ms / DAY) * DAY;

/** Each UTC day's largest Kp from the slots, with the basis of the slot that gave it, between two moments. */
function dailyMaxima(record: KpRecord, fromMs: number, untilMs: number): KpBar[] {
  const days = new Map<number, KpBar>();
  const first = Math.max(0, Math.floor((fromMs - record.startMs) / KP_SLOT_MS));
  const last = Math.min(record.kp3.length, Math.ceil((untilMs - record.startMs) / KP_SLOT_MS));
  for (let i = first; i < last; i++) {
    if (record.kp3[i] === NONE) continue;
    const at = record.startMs + i * KP_SLOT_MS;
    const day = utcDay(at);
    const kp = record.kp3[i] / 3;
    const was = days.get(day);
    if (!was || kp > was.kp! || (kp === was.kp && record.basis[i] > KP_BASES.indexOf(was.basis))) {
      days.set(day, { fromMs: day, untilMs: day + DAY, kp, basis: KP_BASES[record.basis[i]] });
    }
  }
  for (const d of record.outlook) {
    if (d.untilMs < fromMs || d.fromMs > untilMs) continue;
    const day = utcDay(d.fromMs);
    if (!days.has(day)) days.set(day, { fromMs: day, untilMs: day + DAY, kp: d.kp, basis: 'outlook' });
  }
  return [...days.values()].sort((a, b) => a.fromMs - b.fromMs);
}

/** The bars a view draws, in its form. */
export function kpBars(record: KpRecord, view: { startMs: number; spanMs: number }, lod: KpLod = kpLod(view.spanMs)): KpBar[] {
  const fromMs = view.startMs;
  const untilMs = view.startMs + view.spanMs;
  if (lod === 'slots') {
    const bars: KpBar[] = [];
    const first = Math.max(0, Math.floor((fromMs - record.startMs) / KP_SLOT_MS));
    const last = Math.min(record.kp3.length, Math.ceil((untilMs - record.startMs) / KP_SLOT_MS));
    for (let i = first; i < last; i++) {
      if (record.kp3[i] === NONE) continue;
      const at = record.startMs + i * KP_SLOT_MS;
      bars.push({ fromMs: at, untilMs: at + KP_SLOT_MS, kp: record.kp3[i] / 3, basis: KP_BASES[record.basis[i]] });
    }
    for (const d of record.outlook) if (d.untilMs >= fromMs && d.fromMs <= untilMs) bars.push({ ...d });
    return bars;
  }
  if (lod === 'days') return dailyMaxima(record, fromMs, untilMs);
  if (lod === 'stormDays') return dailyMaxima(record, fromMs, untilMs).filter((d) => d.kp! >= STORM_KP);
  // Storms a year: a storm's consecutive days are one storm, counted in the year it began, as the event set has them.
  const years = new Map<number, KpBar>();
  const startYear = new Date(fromMs).getUTCFullYear();
  const days = dailyMaxima(record, Date.UTC(startYear, 0, 1) - DAY, untilMs).filter((d) => d.kp! >= STORM_KP);
  let previous = -Infinity;
  for (const d of days) {
    const year = new Date(d.fromMs).getUTCFullYear();
    const begins = d.fromMs - previous > DAY;
    previous = d.fromMs;
    if (year < startYear) continue;
    const bar = years.get(year) ?? { fromMs: Date.UTC(year, 0, 1), untilMs: Date.UTC(year + 1, 0, 1), storms: 0, basis: 'definitive' };
    if (begins) bar.storms! += 1;
    if (KP_BASES.indexOf(d.basis) > KP_BASES.indexOf(bar.basis)) bar.basis = d.basis;
    years.set(year, bar);
  }
  return [...years.values()].sort((a, b) => a.fromMs - b.fromMs);
}

/** The G scale's level of a Kp, 0 below a storm, 1–5 for G1–G5. */
export const stormLevel = (kp: number): number => (kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= STORM_KP ? 1 : 0);

/** A Kp as its thirds are written: 4−, 4o, 4+. */
export function kpName(kp: number): string {
  const thirds = Math.round(kp * 3);
  const whole = Math.round(thirds / 3);
  const rest = thirds - whole * 3;
  return `${whole}${rest < 0 ? '−' : rest > 0 ? '+' : 'o'}`;
}
