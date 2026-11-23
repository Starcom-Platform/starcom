/**
 * RainViewer's radar, fetched by its terms (decision D-W, WX4; record D-L,
 * L2), for the rain layer: free for personal, educational and small-scale
 * community use, credited "Weather data by RainViewer" with a link, zoom 7 at
 * most and 100 requests a minute per address since 1 January 2026.
 *
 * The protocol, in docs/missions/01-architecture-decisions/weather-visualization.md:
 * - the map list (weather-maps.json) at most every ten minutes, and its newest
 *   past frame;
 * - sixteen tiles a frame, at zoom 2 (a quarter of a degree at the equator,
 *   finer than the model it sits beside);
 * - the coverage tiles, which change rarely, kept a day by the weather cache;
 * - never more than 60 requests in any minute, one at a time;
 * - after a failure, nothing is asked for ten minutes.
 */
import type { GfsCache } from '../gfs/gfsClient';
import { decodePngRgba, type RgbaImage } from '../png';
import { addCoverageTile, addRadarTile, emptyMosaic, type RadarMosaic } from './radar';

const MAPS = 'https://api.rainviewer.com/public/weather-maps.json';
const ZOOM = 2;
const TILES = 2 ** ZOOM;
const MAPS_EVERY_MS = 10 * 60e3;
const COVERAGE_KEEP_MS = 24 * 3600e3;
const PER_MINUTE = 60;
const QUIET_AFTER_FAILURE_MS = 10 * 60e3;

export interface RadarFrame {
  /** When the radar was read. */
  time: Date;
  mosaic: RadarMosaic;
}

export interface RainViewerDeps {
  fetch: typeof fetch;
  now: () => number;
  cache: GfsCache;
  sleep: (ms: number) => Promise<void>;
  /** How often the map list may be read; ten minutes, shorter only in tests. */
  mapsEveryMs?: number;
}

const clock = (t: number) => `${new Date(t).toISOString().slice(11, 16)}Z`;

export class RainViewerClient {
  private chain: Promise<unknown> = Promise.resolve();
  private sent: number[] = [];
  private maps: { at: number; host: string; frame: { time: number; path: string } } | null = null;
  private frame: RadarFrame & { path: string } | null = null;
  private quietUntil = 0;

  constructor(private readonly deps: RainViewerDeps) {}

  /** The newest radar frame, as one mosaic of rate, snow and coverage. */
  load(): Promise<RadarFrame> {
    const result = this.chain.then(() => this.loadNow());
    this.chain = result.catch(() => undefined);
    return result;
  }

  /** One request, after waiting as long as the last minute's 60 require. */
  private async get(url: string): Promise<Response> {
    for (;;) {
      const now = this.deps.now();
      this.sent = this.sent.filter((t) => t > now - 60e3);
      if (this.sent.length < PER_MINUTE) break;
      await this.deps.sleep(this.sent[0] + 60e3 - now);
    }
    this.sent.push(this.deps.now());
    const res = await this.deps.fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/^https:\/\/[^/]+/, '')}`);
    return res;
  }

  private async tile(url: string): Promise<RgbaImage> {
    const res = await this.get(url);
    return decodePngRgba(new Uint8Array(await res.arrayBuffer()));
  }

  private async loadNow(): Promise<RadarFrame> {
    const now = this.deps.now();
    if (now < this.quietUntil) throw new Error(`RainViewer's radar could not be read; Starcom will ask again after ${clock(this.quietUntil)}.`);
    try {
      if (!this.maps || now - this.maps.at >= (this.deps.mapsEveryMs ?? MAPS_EVERY_MS)) {
        const list = await (await this.get(MAPS)).json() as { host: string; radar: { past: Array<{ time: number; path: string }> } };
        const newest = list.radar.past.at(-1);
        if (!newest) throw new Error('the map list names no radar frame');
        this.maps = { at: now, host: list.host, frame: newest };
      }
      const { host, frame } = this.maps;
      if (this.frame?.path === frame.path) return this.frame;

      const mosaic = emptyMosaic(ZOOM);
      for (let ty = 0; ty < TILES; ty++) for (let tx = 0; tx < TILES; tx++) {
        const key = `rainviewer:coverage:${ZOOM}/${tx}/${ty}`;
        const kept = (await this.deps.cache.get(key)) as { at: number; tile: RgbaImage } | null;
        const cover = kept && this.deps.now() - kept.at < COVERAGE_KEEP_MS
          ? kept.tile
          : await this.tile(`${host}/v2/coverage/0/256/${ZOOM}/${tx}/${ty}/0/0_0.png`);
        if (!kept || cover !== kept.tile) await this.deps.cache.put(key, { at: this.deps.now(), tile: cover });
        addCoverageTile(mosaic, tx, ty, cover);
        // Colour scheme 2 (Universal Blue, the only one served), no smoothing, snow drawn as snow.
        addRadarTile(mosaic, tx, ty, await this.tile(`${host}${frame.path}/256/${ZOOM}/${tx}/${ty}/2/0_1.png`));
      }
      this.frame = { time: new Date(frame.time * 1000), mosaic, path: frame.path };
      return this.frame;
    } catch (e) {
      this.quietUntil = this.deps.now() + QUIET_AFTER_FAILURE_MS;
      throw new Error(`RainViewer's radar could not be read (${(e as Error).message}).`);
    }
  }
}
