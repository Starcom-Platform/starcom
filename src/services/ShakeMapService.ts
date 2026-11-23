/**
 * USGS's ShakeMap for a quake (D-EQ, EQ11): its lines of equal shaking, by Modified Mercalli Intensity (MMI), as
 * USGS publishes them. The summary feed names a quake's ShakeMap only by its `types` and gives the quake's detail
 * URL; the detail names the preferred ShakeMap's files, among them cont_mmi.json, the contours at half steps of MMI.
 * Kept: the whole steps from II up (II and III weak, IV light, V moderate, VI strong, VII very strong, VIII severe, IX
 * violent, X and over extreme), or, where USGS drew none of those, its strongest line.
 *
 * Only USGS's own host is read (earthquake.usgs.gov), whatever a detail names; a few at a time; each quake's once,
 * and once more after a failure.
 */
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'ShakeMap' });

const USGS_HOST = 'earthquake.usgs.gov';
const MAX_AT_ONCE = 3;
const TIMEOUT_MS = 15_000;

/** One intensity's lines: each a run of [lng, lat]. */
export interface ShakeContour {
  mmi: number;
  lines: Array<Array<[number, number]>>;
}

/** USGS's MMI words, by whole step. */
export function mmiWords(mmi: number): string {
  if (mmi < 2) return 'not felt';
  if (mmi < 4) return 'weak';
  if (mmi < 5) return 'light';
  if (mmi < 6) return 'moderate';
  if (mmi < 7) return 'strong';
  if (mmi < 8) return 'very strong';
  if (mmi < 9) return 'severe';
  if (mmi < 10) return 'violent';
  return 'extreme';
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** An intensity as USGS writes it: II, V, X. */
export const mmiRoman = (mmi: number): string => ROMAN[Math.max(1, Math.min(10, Math.floor(mmi)))];

const onUsgs = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === USGS_HOST;
  } catch {
    return false;
  }
};

/** The preferred ShakeMap's contour file, from a quake's detail; null where it has none or names another host. */
export function contourUrlOf(detail: unknown): string | null {
  const products = (detail as { properties?: { products?: { shakemap?: unknown } } } | null)?.properties?.products?.shakemap;
  if (!Array.isArray(products) || !products.length) return null;
  const preferred = [...products].sort((a, b) => (Number(b?.preferredWeight) || 0) - (Number(a?.preferredWeight) || 0))[0];
  const url = preferred?.contents?.['download/cont_mmi.json']?.url;
  return onUsgs(url) ? url : null;
}

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1] as number) <= 90;

/** The contours kept from a cont_mmi.json: the whole steps from II up, else the strongest line drawn. */
export function shakeContoursOf(geojson: unknown): ShakeContour[] {
  const features = (geojson as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const all: ShakeContour[] = [];
  for (const feature of features) {
    const mmi = Number(feature?.properties?.value);
    const geometry = feature?.geometry;
    if (!Number.isFinite(mmi) || !geometry) continue;
    const runs: unknown[] = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    const lines = runs
      .filter(Array.isArray)
      .map((run) => (run as unknown[]).filter(isPoint).map((p) => [p[0], p[1]] as [number, number]))
      .filter((run) => run.length >= 2);
    if (lines.length) all.push({ mmi, lines });
  }
  const whole = all.filter((c) => c.mmi >= 2 && Number.isInteger(c.mmi));
  if (whole.length) return whole.sort((a, b) => a.mmi - b.mmi);
  const strongest = all.sort((a, b) => b.mmi - a.mmi)[0];
  return strongest ? [strongest] : [];
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

let running = 0;
const waiting: Array<() => void> = [];
async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function readJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const read = new Map<string, Promise<ShakeContour[] | null>>();

/**
 * A quake's shaking contours, from its detail URL: [] where USGS's ShakeMap drew none, null when it could not be read
 * (asked again on the next call).
 */
export function fetchShakeContours(detailUrl: string, fetcher: Fetcher = fetch): Promise<ShakeContour[] | null> {
  if (!onUsgs(detailUrl)) return Promise.resolve(null);
  const had = read.get(detailUrl);
  if (had) return had;
  const reading = inTurn(async () => {
    const contours = contourUrlOf(await readJson(fetcher, detailUrl));
    return contours ? shakeContoursOf(await readJson(fetcher, contours)) : [];
  }).catch((error: unknown) => {
    log.warn('A ShakeMap could not be read', { detailUrl, error: String(error) });
    read.delete(detailUrl);
    return null;
  });
  read.set(detailUrl, reading);
  return reading;
}

/** Test-only. */
export function resetShakeMapsForTests(): void {
  read.clear();
}
