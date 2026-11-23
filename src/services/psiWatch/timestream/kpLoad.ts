/**
 * Kp as a card reads it (decision D-PW, PW62, PW77): the same record the Kp lane draws (`kp.ts`), GFZ's bake and
 * NOAA's three products merged, read once and kept for half an hour, so a card's Timestream strip draws Kp with the
 * drawer closed. A product that fails leaves the rest; nothing answering is null.
 */
import {
  KP_BAKE_URL, KP_DAILY_URL, KP_FORECAST_URL, KP_OUTLOOK_URL, kpRecord, readKpBake, readKpDaily, readKpForecast, readKpOutlook,
  type KpRecord,
} from './kp';

const KEEP_MS = 30 * 60_000;
let kept: { at: number; record: Promise<KpRecord | null> } | null = null;

async function read(fetcher: typeof fetch): Promise<KpRecord | null> {
  const get = (url: string, as: 'json' | 'text') => fetcher(url).then((r) => (r.ok ? r[as]() : null)).catch(() => null);
  const [bake, forecast, daily, outlook] = await Promise.all([
    get(KP_BAKE_URL, 'json'), get(KP_FORECAST_URL, 'json'), get(KP_DAILY_URL, 'text'), get(KP_OUTLOOK_URL, 'text'),
  ]);
  const history = bake ? readKpBake(bake) : null;
  const recent = [
    ...(typeof daily === 'string' ? readKpDaily(daily) : []),
    ...(forecast ? readKpForecast(forecast) : []),
  ];
  const ahead = typeof outlook === 'string' ? readKpOutlook(outlook) : [];
  return history || recent.length ? kpRecord(history, recent, ahead) : null;
}

/** The Kp record, read now or kept from the last half hour. */
export function loadKpRecord(now: number = Date.now(), fetcher: typeof fetch = fetch): Promise<KpRecord | null> {
  if (!kept || now - kept.at > KEEP_MS) {
    const record = read(fetcher);
    const mine = { at: now, record };
    kept = mine;
    // Nothing answering is not kept: the next card asks again.
    void record.then((r) => { if (r === null && kept === mine) kept = null; });
  }
  return kept.record;
}

/** Test-only: forget the kept record. */
export function resetKpLoadForTests(): void { kept = null; }
