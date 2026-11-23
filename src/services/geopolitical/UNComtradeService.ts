// UNComtradeService — real bilateral trade-flow data, baked into a static file rather than
// queried live: UN Comtrade's free preview tier (comtradeapi.un.org/public/v1/preview) is
// aggressively rate-limited (429s after a handful of requests even with multi-second
// delays between them), and real trade flows don't change day-to-day anyway. See
// public/geopolitical/trade-routes-baked.json's own header for the full source
// documentation — 11 real bilateral export flows (FOB USD, 2023) covering HS 27
// (mineral fuels/oils), HS 26 (ores/slag/ash), and HS 74 (copper), verified live against
// the real API before baking. A few well-known major flows (Saudi Arabia/Russia/Iraq
// crude exports to China) returned no data even after retries — UN Comtrade's public
// reporting genuinely lacks detailed HS-level exports for those reporters, a real
// limitation of the source, not something skipped on our end.
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'UNComtradeService' });

const CATALOG_URL = '/geopolitical/trade-routes-baked.json';

export interface RealTradeRoute {
  id: string;
  from: string; // ISO3
  to: string; // ISO3
  hsCode: string;
  commodity: string;
  value: number; // real reported FOB export value, USD
}

interface TradeRoutesBakedFile {
  routes: RealTradeRoute[];
}

let cache: RealTradeRoute[] | null = null;
let inFlight: Promise<RealTradeRoute[]> | null = null;

export async function getRealTradeRoutes(): Promise<RealTradeRoute[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load trade routes catalog: ${res.status}`);
      return res.json() as Promise<TradeRoutesBakedFile>;
    })
    .then((data) => {
      cache = data.routes;
      return cache;
    })
    .catch((error) => {
      log.error('Failed to load baked trade routes catalog', error);
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
