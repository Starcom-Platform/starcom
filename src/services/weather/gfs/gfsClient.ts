/**
 * The GFS client: how the weather layers read NOAA's model in the browser
 * without overusing anyone's service (decision D-W, WX1 and WX5).
 *
 * NOAA's own copy on AWS is the source; PacIOOS's ERDDAP is the fallback,
 * read only when AWS has failed three times or has not published the step in
 * three runs. Each rule of the protocol in
 * docs/missions/01-architecture-decisions/weather-visualization.md is here,
 * and each has a test:
 *
 * - one load at a time, waits included, so one page never has two requests
 *   open, and never sends one while backing off;
 * - only the bytes of the field asked for, by the index's byte range, and
 *   never a whole file: a response that ignores the range is refused;
 * - a field is kept by run, step and name, and never fetched twice; the run
 *   listing is kept an hour, so a reload within the hour asks nothing;
 * - a failure waits 30 s, then 60 s, with jitter, never less than the server's
 *   Retry-After; after both sources fail, nothing is asked for 15 minutes.
 *
 * A moment between two of the model's 3-hour steps is read as both, from one
 * run, to be blended (loadAround; WX10). On PacIOOS the nearest hour alone is
 * read, unblended, so the fallback is asked half as often.
 */
import { decodeGrib2, findField, parseIdx, type IdxRecord, type LatLonGrid } from './grib2';
import { erddapField, readNetcdf3 } from './netcdf3';

export type GfsFieldName = 'tmp2m' | 'prate' | 'u10' | 'v10' | 'tcdc';

interface FieldSpec {
  name: string;
  level: string;
  /** Which forecast column to take when a field has a moment and a mean. */
  forecast?: RegExp;
  parameter: [number, number, number];
  units: string;
  /** The same field's name on PacIOOS's ERDDAP; null where it has none. */
  erddap: string | null;
}

const FIELDS: Record<GfsFieldName, FieldSpec> = {
  tmp2m: { name: 'TMP', level: '2 m above ground', parameter: [0, 0, 0], units: 'K', erddap: 'tmp2m' },
  // The mean over the window, not the moment: an instantaneous rain rate is spiky.
  prate: { name: 'PRATE', level: 'surface', forecast: /ave/, parameter: [0, 1, 7], units: 'kg m-2 s-1', erddap: 'pratesfc' },
  u10: { name: 'UGRD', level: '10 m above ground', parameter: [0, 2, 2], units: 'm s-1', erddap: 'ugrd10m' },
  v10: { name: 'VGRD', level: '10 m above ground', parameter: [0, 2, 3], units: 'm s-1', erddap: 'vgrd10m' },
  tcdc: { name: 'TCDC', level: 'entire atmosphere', forecast: /fcst$/, parameter: [0, 6, 1], units: '%', erddap: null },
};

const AWS = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
const ERDDAP = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global';
const HOUR = 3600e3;
const LISTING_FRESH_MS = HOUR;
const FIRST_WAIT_MS = 30e3;
const MAX_WAIT_MS = 15 * 60e3;
const ATTEMPTS = 3;
const QUIET_AFTER_FAILURE_MS = 15 * 60e3;
const LAST_STEP = 384;

export interface GfsField {
  field: GfsFieldName;
  source: 'aws' | 'pacioos';
  /** The run the values come from; null for PacIOOS, whose series joins several runs. */
  run: Date | null;
  step: number | null;
  valid: Date;
  window?: { start: Date; end: Date };
  units: string;
  grid: LatLonGrid;
  values: Float32Array;
}

/** A field at a moment, as two steps to blend (WX10). */
export interface GfsBlend {
  /** The moment asked for. */
  at: Date;
  /** The step at or before the moment, and the step after it, from one run: one field when the moment is a step's own hour. */
  before: GfsField;
  after: GfsField;
  /** How far the moment lies from before to after: 0 at before, toward 1 at after. */
  weight: number;
}

export interface GfsStatus {
  state: 'loading' | 'waiting' | 'fallback' | 'ready' | 'failed';
  message: string;
  /** While waiting or after failing: when the next request may go. */
  retryAt?: Date;
}

/** Where fields and the run listing are kept between loads and page loads. */
export interface GfsCache {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

export function memoryGfsCache(): GfsCache {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}

export interface GfsClientDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  cache: GfsCache;
}

/**
 * The runs that can answer a moment, newest first: each with the step whose
 * valid time is nearest. A step under 3 hours is passed over, since the
 * analysis has no mean rain; nothing past the model's 16 days.
 */
export function runCandidates(target: number, runs: number[]): { run: number; step: number }[] {
  return [...runs]
    .sort((a, b) => b - a)
    .map((run) => ({ run, step: Math.round((target - run) / (3 * HOUR)) * 3 }))
    .filter(({ step }) => step >= 3 && step <= LAST_STEP);
}

/**
 * The runs that can answer a moment with a blend, newest first (WX10): each
 * with the step at or before the moment and the step after it, and how far
 * between them the moment lies. On a step's own hour, that step alone. As
 * runCandidates: never the analysis, nothing past the model's 16 days.
 */
export function stepsAround(target: number, runs: number[]): { run: number; steps: [number, number]; weight: number }[] {
  return [...runs]
    .sort((a, b) => b - a)
    .map((run) => {
      const before = Math.floor((target - run) / (3 * HOUR)) * 3;
      const weight = (target - run - before * HOUR) / (3 * HOUR);
      return { run, steps: [before, weight === 0 ? before : before + 3] as [number, number], weight };
    })
    .filter(({ steps }) => steps[0] >= 3 && steps[1] <= LAST_STEP);
}

class Unpublished extends Error {}
class Refused extends Error {
  constructor(message: string, readonly retryAfterMs = 0) { super(message); }
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
const hh = (t: number) => new Date(t).toISOString().slice(11, 13);
const fff = (step: number) => `f${String(step).padStart(3, '0')}`;
const fileUrl = (run: number, step: number) => `${AWS}/gfs.${ymd(run)}/${hh(run)}/atmos/gfs.t${hh(run)}z.pgrb2.1p00.${fff(step)}`;
const clock = (t: number) => `${new Date(t).toISOString().slice(11, 16)}Z`;

export class GfsClient {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(s: GfsStatus) => void>();
  private readonly indexes = new Map<string, IdxRecord[]>();
  private readonly fields = new Map<string, GfsField>();
  private quietUntil = 0;

  constructor(private readonly deps: GfsClientDeps) {}

  onStatus(listener: (s: GfsStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A field at a moment (now by default), from the run and step nearest it. */
  load(field: GfsFieldName, at?: number): Promise<GfsField> {
    const result = this.chain.then(() => this.loadNow(field, at ?? this.deps.now()));
    this.chain = result.catch(() => undefined);
    return result;
  }

  /** A field at a moment as the two steps around it, to blend (WX10); one load at a time with load(). */
  loadAround(field: GfsFieldName, at: number): Promise<GfsBlend> {
    const result = this.chain.then(() => this.loadAroundNow(field, at));
    this.chain = result.catch(() => undefined);
    return result;
  }

  private status(s: GfsStatus) {
    for (const l of this.listeners) l(s);
  }

  private loadNow(field: GfsFieldName, target: number): Promise<GfsField> {
    const spec = FIELDS[field];
    return this.fromSources(spec, () => this.fromAws(field, spec, target), () => this.fromPacioos(field, spec, target), (got) => got.valid);
  }

  private loadAroundNow(field: GfsFieldName, target: number): Promise<GfsBlend> {
    const spec = FIELDS[field];
    return this.fromSources(
      spec,
      () => this.blendFromAws(field, spec, target),
      async () => {
        const got = await this.fromPacioos(field, spec, target);
        return { at: new Date(target), before: got, after: got, weight: 0 };
      },
      (blend) => blend.at,
    );
  }

  /** AWS, with its retries, then PacIOOS, with its own; the quiet period after both fail. */
  private async fromSources<T>(spec: FieldSpec, aws: () => Promise<T>, pacioos: () => Promise<T>, hourOf: (got: T) => Date): Promise<T> {
    const now = this.deps.now();
    if (now < this.quietUntil) {
      throw new Error(`NOAA's model could not be read; Starcom will ask again after ${clock(this.quietUntil)}.`);
    }
    this.status({ state: 'loading', message: `Reading ${spec.name} from NOAA.` });
    let awsProblem: string;
    try {
      const got = await this.withRetries(aws);
      this.status({ state: 'ready', message: `NOAA GFS, ${clock(hourOf(got).getTime())}.` });
      return got;
    } catch (e) {
      awsProblem = (e as Error).message;
    }
    if (!spec.erddap) return this.fail(`NOAA's bucket on AWS did not answer (${awsProblem}), and PacIOOS does not carry ${spec.name}.`);
    this.status({ state: 'fallback', message: `NOAA's bucket did not answer; reading PacIOOS.` });
    try {
      const got = await this.withRetries(pacioos);
      this.status({ state: 'ready', message: `NOAA GFS via PacIOOS, ${clock(hourOf(got).getTime())}.` });
      return got;
    } catch (e) {
      return this.fail(`Neither NOAA's bucket on AWS (${awsProblem}) nor PacIOOS (${(e as Error).message}) answered.`);
    }
  }

  private fail(message: string): never {
    this.quietUntil = this.deps.now() + QUIET_AFTER_FAILURE_MS;
    this.status({ state: 'failed', message, retryAt: new Date(this.quietUntil) });
    throw new Error(message);
  }

  /** Three attempts, waiting 30 s then 60 s between them; "not published" goes straight on. */
  private async withRetries<T>(attempt: () => Promise<T>): Promise<T> {
    for (let k = 0; ; k++) {
      try {
        return await attempt();
      } catch (e) {
        if (e instanceof Unpublished || k === ATTEMPTS - 1) throw e;
        const jittered = Math.min(FIRST_WAIT_MS * 2 ** k, MAX_WAIT_MS) * (0.5 + this.deps.random());
        const wait = Math.max(jittered, e instanceof Refused ? e.retryAfterMs : 0);
        this.status({ state: 'waiting', message: (e as Error).message, retryAt: new Date(this.deps.now() + wait) });
        await this.deps.sleep(wait);
        this.status({ state: 'loading', message: 'Trying again.' });
      }
    }
  }

  private async get(url: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.deps.fetch(url, init);
    } catch (e) {
      throw new Refused(`no connection (${(e as Error).message})`);
    }
    if (res.status === 404 || res.status === 403) return res;
    if (!res.ok) {
      const after = Number(res.headers.get('Retry-After'));
      throw new Refused(`HTTP ${res.status}`, Number.isFinite(after) && after > 0 ? after * 1000 : 0);
    }
    return res;
  }

  /** The runs out on a day, from the bucket's listing, kept an hour. */
  private async runsOn(day: string): Promise<number[]> {
    const key = `listing:${day}`;
    const kept = (await this.deps.cache.get(key)) as { checkedAt: number; runs: number[] } | null;
    if (kept && this.deps.now() - kept.checkedAt < LISTING_FRESH_MS) return kept.runs;
    const res = await this.get(`${AWS}/?list-type=2&prefix=gfs.${day}/&delimiter=/`);
    const runs = res.ok
      ? [...(await res.text()).matchAll(/<Prefix>gfs\.(\d{4})(\d\d)(\d\d)\/(\d\d)\/<\/Prefix>/g)].map((m) => Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]))
      : [];
    await this.deps.cache.put(key, { checkedAt: this.deps.now(), runs });
    return runs;
  }

  /**
   * The first three runs that can answer a moment, by pick: from the listing of
   * the moment's day, or today's for a moment still to come (a forecast hour is
   * a step of today's runs), and the day before's when that has too few.
   */
  private async candidates<C>(target: number, pick: (target: number, runs: number[]) => C[]): Promise<C[]> {
    const listed = new Date(Math.min(target, this.deps.now()));
    const day = Date.UTC(listed.getUTCFullYear(), listed.getUTCMonth(), listed.getUTCDate());
    let found = pick(target, await this.runsOn(ymd(day)));
    if (found.length < ATTEMPTS) found = [...found, ...pick(target, await this.runsOn(ymd(day - 24 * HOUR)))];
    return found.slice(0, ATTEMPTS);
  }

  /** A step's field when it has been read before, on this page or kept by the cache. */
  private async kept(field: GfsFieldName, run: number, step: number): Promise<GfsField | null> {
    const key = `aws:${ymd(run)}${hh(run)}:${fff(step)}:${field}`;
    const kept = this.fields.get(key) ?? ((await this.deps.cache.get(key)) as GfsField | null);
    if (kept) this.fields.set(key, kept);
    return kept;
  }

  /** A step's field from its file, by the byte range its index gives, checked to be that field at that hour. */
  private async fetchStep(field: GfsFieldName, spec: FieldSpec, run: number, step: number, records: IdxRecord[]): Promise<GfsField> {
    const rec = findField(records, spec.name, spec.level, spec.forecast);
    if (!rec) throw new Refused(`the ${fff(step)} index lists no ${spec.name} at ${spec.level}`);
    const res = await this.get(fileUrl(run, step), { headers: { Range: `bytes=${rec.start}-${rec.end ?? ''}` } });
    if (res.status !== 206) {
      await res.body?.cancel();
      throw new Refused(`HTTP ${res.status} for a byte range`);
    }
    const decoded = decodeGrib2(new Uint8Array(await res.arrayBuffer()));
    const p = decoded.parameter;
    if ([p.discipline, p.category, p.number].join() !== spec.parameter.join()) throw new Refused(`the range held another field than ${spec.name}`);
    if (decoded.valid.getTime() !== run + step * HOUR) throw new Refused(`the range held another step than ${fff(step)}`);
    const got: GfsField = { field, source: 'aws', run: new Date(run), step, valid: decoded.valid, window: decoded.window, units: spec.units, grid: decoded.grid, values: decoded.values };
    this.fields.set(`aws:${ymd(run)}${hh(run)}:${fff(step)}:${field}`, got);
    await this.deps.cache.put(`aws:${ymd(run)}${hh(run)}:${fff(step)}:${field}`, got);
    return got;
  }

  private async fromAws(field: GfsFieldName, spec: FieldSpec, target: number): Promise<GfsField> {
    for (const { run, step } of await this.candidates(target, runCandidates)) {
      const kept = await this.kept(field, run, step);
      if (kept) return kept;
      const records = await this.index(run, step);
      if (!records) continue;
      return this.fetchStep(field, spec, run, step, records);
    }
    throw new Unpublished(`no run of the last ${ATTEMPTS} has published the step`);
  }

  /** Both steps around a moment from the first run that has published both; every index before any field's bytes. */
  private async blendFromAws(field: GfsFieldName, spec: FieldSpec, target: number): Promise<GfsBlend> {
    for (const { run, steps: [first, second], weight } of await this.candidates(target, stepsAround)) {
      const steps = first === second ? [first] : [first, second];
      const have = new Map<number, GfsField>();
      const indexes = new Map<number, IdxRecord[]>();
      let published = true;
      for (const step of steps) {
        const kept = await this.kept(field, run, step);
        if (kept) { have.set(step, kept); continue; }
        const records = await this.index(run, step);
        if (!records) { published = false; break; }
        indexes.set(step, records);
      }
      if (!published) continue;
      for (const step of steps) if (!have.has(step)) have.set(step, await this.fetchStep(field, spec, run, step, indexes.get(step)!));
      return { at: new Date(target), before: have.get(first)!, after: have.get(second)!, weight };
    }
    throw new Unpublished(`no run of the last ${ATTEMPTS} has published both steps`);
  }

  private async index(run: number, step: number): Promise<IdxRecord[] | null> {
    const key = `${run}:${step}`;
    const kept = this.indexes.get(key);
    if (kept) return kept;
    const res = await this.get(`${fileUrl(run, step)}.idx`);
    if (!res.ok) return null;
    const records = parseIdx(await res.text());
    this.indexes.set(key, records);
    return records;
  }

  private async fromPacioos(field: GfsFieldName, spec: FieldSpec, target: number): Promise<GfsField> {
    const valid = Math.round(target / (3 * HOUR)) * 3 * HOUR;
    const key = `pacioos:${new Date(valid).toISOString()}:${field}`;
    const kept = (await this.deps.cache.get(key)) as (GfsField & { storedAt: number }) | null;
    if (kept && this.deps.now() - kept.storedAt < HOUR) return kept;
    const time = new Date(valid).toISOString().replace('.000', '');
    const res = await this.get(`${ERDDAP}.nc?${spec.erddap}%5B(${time})%5D%5B(90):2:(-90)%5D%5B(0):2:(359.5)%5D`);
    if (!res.ok) throw new Refused(`HTTP ${res.status}`);
    const f = erddapField(readNetcdf3(new Uint8Array(await res.arrayBuffer())), spec.erddap!);
    if (f.valid.getTime() !== valid) throw new Refused(`the response is for ${f.valid.toISOString()}, not ${time}`);
    const got: GfsField = { field, source: 'pacioos', run: null, step: null, valid: f.valid, units: spec.units, grid: f.grid, values: f.values };
    await this.deps.cache.put(key, { ...got, storedAt: this.deps.now() });
    return got;
  }
}
