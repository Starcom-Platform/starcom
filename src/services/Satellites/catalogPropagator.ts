/**
 * Where the satellite catalogue is propagated (D-GV GV2): in a worker, and on the page's thread, a moment later,
 * where a worker cannot be made (a sandbox, a test) or fails.
 */
import type { SatRec } from 'satellite.js';
import { propagateCatalog, satrecsOf, type OmmRecord } from './catalogPropagation';
import type { CatalogAnswer, CatalogJob } from './catalogPropagation.worker';

export interface CatalogSnapshots {
  timesMs: number[];
  /** x, y, z per object for each moment, in the globe's scene frame. */
  positions: Float32Array[];
  /** Each object's height in km at the first moment; NaN where it does not propagate. */
  heights: Float32Array;
}

export interface CatalogPropagator {
  /** The elements, read once; how many there are, and how many SGP4 can read. */
  load(records: readonly OmmRecord[]): Promise<{ loaded: number; readable: number }>;
  /** The whole catalogue at each moment given. */
  step(timesMs: readonly number[]): Promise<CatalogSnapshots>;
  dispose(): void;
}

const later = <T>(work: () => T): Promise<T> => new Promise((resolve, reject) => {
  setTimeout(() => { try { resolve(work()); } catch (error) { reject(error); } }, 0);
});

/** On the page's thread, after the current frame. */
export function mainThreadPropagator(): CatalogPropagator {
  let satrecs: Array<SatRec | null> = [];
  return {
    load: (records) => later(() => {
      satrecs = satrecsOf(records);
      return { loaded: satrecs.length, readable: satrecs.filter(Boolean).length };
    }),
    step: (timesMs) => later(() => {
      const heights = new Float32Array(satrecs.length);
      const positions = timesMs.map((t, k) => {
        const out = new Float32Array(satrecs.length * 3);
        propagateCatalog(satrecs, t, out, k === 0 ? heights : undefined);
        return out;
      });
      return { timesMs: [...timesMs], positions, heights };
    }),
    dispose: () => { satrecs = []; },
  };
}

/** In a worker; one that cannot be made, or fails, gives way to the page's thread, the elements sent to it again. */
export function createCatalogPropagator(): CatalogPropagator {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./catalogPropagation.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  if (!worker) return mainThreadPropagator();
  const fallback = mainThreadPropagator();
  let records: readonly OmmRecord[] = [];
  let fallbackLoaded: Promise<unknown> | null = null;
  let broken = false;
  let next = 0;
  const waiting = new Map<number, { resolve: (a: CatalogAnswer) => void; reject: (e: Error) => void; job: CatalogJob }>();
  const here = async (job: CatalogJob): Promise<CatalogAnswer> => {
    fallbackLoaded ??= fallback.load(records);
    if (job.kind === 'load') {
      fallbackLoaded = fallback.load(job.records);
      return { id: job.id, ...(await fallbackLoaded as { loaded: number; readable: number }) };
    }
    await fallbackLoaded;
    return { id: job.id, ...(await fallback.step(job.timesMs)) };
  };
  worker.onmessage = (event: MessageEvent<CatalogAnswer>) => {
    const job = waiting.get(event.data.id);
    if (!job) return;
    waiting.delete(event.data.id);
    if ('error' in event.data) job.reject(new Error(event.data.error));
    else job.resolve(event.data);
  };
  worker.onerror = () => {
    broken = true;
    worker?.terminate();
    for (const job of waiting.values()) here(job.job).then(job.resolve, job.reject);
    waiting.clear();
  };
  const send = (job: { kind: 'load'; records: OmmRecord[] } | { kind: 'step'; timesMs: number[] }): Promise<CatalogAnswer> => {
    const full = { ...job, id: ++next } as CatalogJob;
    if (broken || !worker) return here(full);
    return new Promise((resolve, reject) => {
      waiting.set(full.id, { resolve, reject, job: full });
      worker!.postMessage(full);
    });
  };
  return {
    load(given) {
      records = given;
      return send({ kind: 'load', records: [...given] }).then((a) => {
        if (!('loaded' in a)) throw new Error('the worker answered a load without counts');
        return { loaded: a.loaded, readable: a.readable };
      });
    },
    step(timesMs) {
      return send({ kind: 'step', timesMs: [...timesMs] }).then((a) => {
        if (!('positions' in a)) throw new Error('the worker answered a step without positions');
        return { timesMs: a.timesMs, positions: a.positions, heights: a.heights };
      });
    },
    dispose() {
      worker?.terminate();
      waiting.clear();
      fallback.dispose();
    },
  };
}
