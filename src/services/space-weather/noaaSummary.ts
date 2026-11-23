// noaaSummary.ts — NOAA's own statement of space weather right now: the NOAA Space
// Weather Scales (R radio blackout, S solar radiation, G geomagnetic storm, each 0-5)
// and the official alerts, watches and warnings SWPC issues. About 47 KB.
//
// ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The Threat Assessment panel and the collaboration bridge showed "space-hazard
// alerts, read from the live NOAA feed" in "NOAA's severity vocabulary". Neither was
// NOAA's. They were generated in Starcom from NOAA's electric-field grids — Starcom's
// own thresholds (1,000 / 2,000 / 3,000 / 5,000 mV/km) mapped to Starcom's own labels
// ("infrastructure_risk", "extreme"), each stamped with the time it was computed. And
// to compute them, every page load fetched both grids: 1.98 MB from NOAA, measured on
// 2026-09-11 with no Space Weather layer on screen.
//
// NOAA publishes its assessment directly. These are those products, read as issued.
import { fetchWithTimeout } from './fetchWithTimeout';

export const NOAA_SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
export const NOAA_ALERTS_URL = 'https://services.swpc.noaa.gov/products/alerts.json';
const REQUEST_TIMEOUT_MS = 12000;
/** Both products update within minutes; neither is worth asking for more often. */
export const NOAA_SUMMARY_TTL_MS = 5 * 60 * 1000;

export type NoaaScaleName = 'R' | 'S' | 'G';

export interface NoaaScaleNow {
  scale: NoaaScaleName;
  /** 0 (none) to 5 (extreme), as NOAA states it. */
  level: number;
  /** NOAA's own word for it: "none", "minor", "moderate", "strong", "severe", "extreme". */
  text: string;
}

export interface NoaaOfficialAlert {
  /** SWPC product code, e.g. "K05A" — Geomagnetic K-index of 5 alert. */
  productId: string;
  /** ISO, UTC: when SWPC issued it. */
  issuedAt: string;
  /** The message's own first line: "ALERT: Geomagnetic K-index of 5". */
  headline: string;
}

export interface NoaaSpaceWeatherSummary {
  scales: NoaaScaleNow[];
  /** ISO, UTC: the time NOAA gives its current scales. */
  observedAt: string;
  /** Newest first. */
  alerts: NoaaOfficialAlert[];
}

export class NoaaSummaryError extends Error {}

/** NOAA writes these times without a zone; they are UTC, never the reader's local time. */
function utc(date: string, time = ''): string | null {
  const s = `${date.trim()}${time ? `T${time.trim()}` : ''}`.replace(' ', 'T');
  const t = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * The CURRENT scales: noaa-scales.json keys "0" as now, positive keys as the
 * forecast days and negative keys as past days.
 */
export function parseNoaaScales(json: unknown): { scales: NoaaScaleNow[]; observedAt: string } {
  const now = (json as Record<string, Record<string, unknown>> | null)?.['0'];
  if (!now) throw new NoaaSummaryError('NOAA scales carry no current entry');
  const observedAt = utc(String(now.DateStamp ?? ''), String(now.TimeStamp ?? ''));
  if (!observedAt) throw new NoaaSummaryError('NOAA scales carry no readable time');
  const scales = (['R', 'S', 'G'] as const).map((scale) => {
    const entry = now[scale] as { Scale?: unknown; Text?: unknown } | undefined;
    const level = Number(entry?.Scale);
    if (!entry || entry.Scale === null || !Number.isInteger(level) || level < 0 || level > 5) {
      throw new NoaaSummaryError(`NOAA scales carry no current ${scale} level`);
    }
    return { scale, level, text: typeof entry.Text === 'string' ? entry.Text : '' };
  });
  return { scales, observedAt };
}

const HEADER_LINE = /^(Space Weather Message Code|Serial Number|Issue Time):/;

/** Every official message, newest first, each with its own headline. Unreadable ones are skipped. */
export function parseNoaaAlerts(json: unknown): NoaaOfficialAlert[] {
  if (!Array.isArray(json)) throw new NoaaSummaryError('NOAA alerts are not a list');
  const alerts: NoaaOfficialAlert[] = [];
  for (const item of json as Array<Record<string, unknown>>) {
    const issuedAt = typeof item?.issue_datetime === 'string' ? utc(item.issue_datetime) : null;
    const message = typeof item?.message === 'string' ? item.message : '';
    const headline = message.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !HEADER_LINE.test(l));
    if (!issuedAt || !headline || typeof item.product_id !== 'string') continue;
    alerts.push({ productId: item.product_id, issuedAt, headline });
  }
  return alerts.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

let cache: { summary: NoaaSpaceWeatherSummary; fetchedAt: number } | null = null;
let inflight: Promise<NoaaSpaceWeatherSummary> | null = null;

export async function fetchNoaaSpaceWeatherSummary(): Promise<NoaaSpaceWeatherSummary> {
  if (cache && Date.now() - cache.fetchedAt < NOAA_SUMMARY_TTL_MS) return cache.summary;
  inflight ??= (async () => {
    const [scalesRes, alertsRes] = await Promise.all([
      fetchWithTimeout(NOAA_SCALES_URL, REQUEST_TIMEOUT_MS),
      fetchWithTimeout(NOAA_ALERTS_URL, REQUEST_TIMEOUT_MS),
    ]);
    if (!scalesRes.ok) throw new NoaaSummaryError(`NOAA scales: HTTP ${scalesRes.status}`);
    if (!alertsRes.ok) throw new NoaaSummaryError(`NOAA alerts: HTTP ${alertsRes.status}`);
    const { scales, observedAt } = parseNoaaScales(await scalesRes.json());
    const summary = { scales, observedAt, alerts: parseNoaaAlerts(await alertsRes.json()) };
    cache = { summary, fetchedAt: Date.now() };
    return summary;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Test-only. */
export function clearNoaaSummaryCache(): void {
  cache = null;
  inflight = null;
}
