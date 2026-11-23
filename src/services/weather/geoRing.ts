/**
 * EUMETSAT's Geostationary Ring infrared image (10.8 µm), the source of the
 * real cloud layer (decision D-W, WX2 as revised on 2026-10-06): one global
 * mosaic of every geostationary weather satellite (Meteosat, GOES-East and
 * West, Himawari), 80°N to 80°S, every 3 hours, read in the browser from
 * EUMETView's WMS.
 *
 * The protocol, in docs/missions/01-architecture-decisions/weather-visualization.md:
 * - a slot at least two hours old: what EUMETView has published, and
 *   EUMETSAT's open "Core" data (an image under an hour old is not);
 * - one request at a time;
 * - a slot is fetched once, kept by the shared weather cache across reloads;
 * - a slot that fails (EUMETView answers a 502 for one it is still
 *   assembling, seen 2026-10-06) is stepped back from at once, at most four
 *   slots, twelve hours;
 * - after all four fail, nothing is asked for 15 minutes.
 */
import type { GfsCache } from './gfs/gfsClient';

const WMS = 'https://view.eumetsat.int/geoserver/wms';
const LAYER = 'mumi:worldcloudmap_ir108';
const H = 3600e3;
const SLOT_MS = 3 * H;
const MIN_AGE_MS = 2 * H;
const SLOTS_TRIED = 4;
const QUIET_AFTER_FAILURE_MS = 15 * 60e3;

export interface GeoRingImage {
  /** The 3-hourly slot the mosaic holds for. */
  slot: Date;
  /** The PNG as EUMETView served it: greyscale infrared, white the coldest, transparent where no satellite sees. */
  blob: Blob;
}

export interface GeoRingDeps {
  fetch: typeof fetch;
  now: () => number;
  cache: GfsCache;
}

/**
 * The slots that can answer a moment, first to try first: the slot nearest the
 * moment, or the newest published (two hours old) when that one is not out
 * yet, then stepping back three hours at a time. The two hours are counted
 * from now, not from the moment: a moment a day ago was seen long since.
 */
export function geoRingSlots(at: number, now = at): number[] {
  const published = Math.floor((now - MIN_AGE_MS) / SLOT_MS) * SLOT_MS;
  const first = Math.min(Math.round(at / SLOT_MS) * SLOT_MS, published);
  return Array.from({ length: SLOTS_TRIED }, (_, k) => first - k * SLOT_MS);
}

/** The whole ring as one equirectangular image, west to east from 180°W, north at the top. */
export function geoRingUrl(slot: number, width = 2048): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: LAYER, STYLES: '',
    CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', WIDTH: String(width), HEIGHT: String(width / 2),
    FORMAT: 'image/png', TIME: new Date(slot).toISOString().replace('.000', ''),
  });
  return `${WMS}?${params.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')}`;
}

const clock = (t: number) => `${new Date(t).toISOString().slice(11, 16)}Z`;

export class GeoRingClient {
  private chain: Promise<unknown> = Promise.resolve();
  private quietUntil = 0;

  constructor(private readonly deps: GeoRingDeps) {}

  /** The mosaic for a moment (now by default): the slot nearest it, or the newest published. */
  load(at?: number): Promise<GeoRingImage> {
    const result = this.chain.then(() => this.loadNow(at ?? this.deps.now()));
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async loadNow(at: number): Promise<GeoRingImage> {
    if (this.deps.now() < this.quietUntil) {
      throw new Error(`EUMETSAT's cloud images could not be read; Starcom will ask again after ${clock(this.quietUntil)}.`);
    }
    const problems: string[] = [];
    for (const slot of geoRingSlots(at, this.deps.now())) {
      const key = `georing:${new Date(slot).toISOString()}`;
      const kept = (await this.deps.cache.get(key)) as { blob: Blob } | null;
      if (kept?.blob) return { slot: new Date(slot), blob: kept.blob };
      try {
        const res = await this.deps.fetch(geoRingUrl(slot));
        const type = res.headers.get('Content-Type') ?? '';
        if (!res.ok || !type.startsWith('image/')) {
          await res.body?.cancel();
          problems.push(`${clock(slot)}: ${res.ok ? `not a picture (${type || 'no type'})` : `HTTP ${res.status}`}`);
          continue;
        }
        const blob = await res.blob();
        await this.deps.cache.put(key, { blob });
        return { slot: new Date(slot), blob };
      } catch (e) {
        problems.push(`${clock(slot)}: no connection (${(e as Error).message})`);
      }
    }
    this.quietUntil = this.deps.now() + QUIET_AFTER_FAILURE_MS;
    throw new Error(`No EUMETSAT cloud image of the last 12 hours could be read (${problems.join('; ')}).`);
  }
}
