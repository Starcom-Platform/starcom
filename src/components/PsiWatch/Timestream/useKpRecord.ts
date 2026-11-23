import { useEffect, useMemo, useState } from 'react';
import { useRegisteredPoller } from '../../../hooks/useRegisteredPoller';
import { makeModeScope } from '../../../services/pollerScopes';
import {
  KP_BAKE_URL, KP_DAILY_URL, KP_FORECAST_URL, KP_OUTLOOK_URL, kpRecord, readKpBake, readKpDaily, readKpForecast, readKpOutlook,
  type KpRecord, type KpSpan,
} from '../../../services/psiWatch/timestream/kp';

/** NOAA's products change every three hours at most; read them twice an hour while the lane shows. */
const NOAA_EVERY_MS = 30 * 60_000;

let bake: Promise<ReturnType<typeof readKpBake>> | null = null;
/** GFZ's bake, read once a visit; a failed read is tried again next time. */
const loadBake = () => (bake ??= fetch(KP_BAKE_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then(readKpBake)
  .catch(() => { bake = null; return null; }));

/**
 * The field lane's Kp (decision D-PW, PW42): GFZ's bake once, NOAA's three products while the lane shows, merged; a
 * product that fails keeps what it gave last. Null until any of them has answered.
 */
export function useKpRecord(enabled: boolean): KpRecord | null {
  const [history, setHistory] = useState<ReturnType<typeof readKpBake>>(null);
  const [recent, setRecent] = useState<{ daily: KpSpan[]; forecast: KpSpan[]; outlook: KpSpan[] }>({ daily: [], forecast: [], outlook: [] });

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void loadBake().then((b) => { if (live && b) setHistory(b); });
    return () => { live = false; };
  }, [enabled]);

  useRegisteredPoller('psi-timestream-kp', async (signal) => {
    const read = (url: string, as: 'json' | 'text') => fetch(url, { signal }).then((r) => (r.ok ? r[as]() : null)).catch(() => null);
    const [forecast, daily, outlook] = await Promise.all([read(KP_FORECAST_URL, 'json'), read(KP_DAILY_URL, 'text'), read(KP_OUTLOOK_URL, 'text')]);
    if (signal.aborted) return;
    setRecent((was) => ({
      forecast: forecast ? readKpForecast(forecast) : was.forecast,
      daily: typeof daily === 'string' ? readKpDaily(daily) : was.daily,
      outlook: typeof outlook === 'string' ? readKpOutlook(outlook) : was.outlook,
    }));
  }, { intervalMs: NOAA_EVERY_MS, immediate: true, enabled, scope: makeModeScope('PsiWatch') });

  return useMemo(() => (history || recent.forecast.length || recent.daily.length
    ? kpRecord(history, [...recent.daily, ...recent.forecast], recent.outlook) : null), [history, recent]);
}
