/**
 * Where the Timestream's sky is computed (decision D-PW, PW38): in a worker, or on the page's thread a moment later
 * where a worker cannot be made (a sandbox, a test). Only the latest view is worked on: while one job runs, a newer
 * request replaces any that waits, and each one passed over answers null. Cosmic Cypher's queue had no such rule, so a
 * drag lined up a full recompute for every step of it.
 */
import { skyColumns, type LaneBody, type Observer, type SkyColumns } from '../../../services/psiWatch/timestream/skyColumns';
import type { TimeView } from '../../../services/psiWatch/timestream/timeView';
import type { ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { moonMarks } from '../../../services/psiWatch/timestream/moonMarks';
import { graphColumns } from '../../../services/psiWatch/timestream/graphColumns';
import type { SkyAnswer, SkyJob } from './sky.worker';

/** `moon`: the Moon's marks too, for a view whose Moon lane draws them (PW51); `graphs`: the graph lanes' series (PW45). */
export interface SkyRequest { view: TimeView; columns: number; bodies: readonly LaneBody[]; frame: ZodiacFrame; observer?: Observer; moon?: boolean; graphs?: boolean }

export interface SkyComputer {
  /** The view's sky, or null when a newer request came before this one was worked on. */
  compute(request: SkyRequest): Promise<SkyColumns | null>;
  dispose(): void;
}

type Run = (job: SkyJob) => Promise<SkyColumns>;

/** Runs one job at a time; a request arriving while one runs waits, and a newer one takes its place. */
export function latestOnly(run: Run): SkyComputer {
  let next = 0;
  let running = false;
  let waiting: { job: SkyJob; resolve: (sky: SkyColumns | null) => void; reject: (error: Error) => void } | null = null;
  let disposed = false;
  const start = (job: SkyJob, resolve: (sky: SkyColumns | null) => void, reject: (error: Error) => void) => {
    running = true;
    run(job).then(resolve, reject).finally(() => {
      running = false;
      const queued = waiting;
      waiting = null;
      if (queued && !disposed) start(queued.job, queued.resolve, queued.reject);
      else queued?.resolve(null);
    });
  };
  return {
    compute(request) {
      const job: SkyJob = { id: ++next, ...request, bodies: [...request.bodies] };
      return new Promise((resolve, reject) => {
        if (disposed) { resolve(null); return; }
        if (!running) { start(job, resolve, reject); return; }
        waiting?.resolve(null);
        waiting = { job, resolve, reject };
      });
    },
    dispose() {
      disposed = true;
      waiting?.resolve(null);
      waiting = null;
    },
  };
}

const onThisThread: Run = (job) => new Promise((resolve, reject) => {
  setTimeout(() => {
    try {
      const sky = skyColumns(job.view, job.columns, job.bodies, job.frame, job.observer);
      resolve({ ...sky, ...(job.moon ? { moonMarks: moonMarks(job.view) } : {}), ...(job.graphs ? { graphs: graphColumns(job.view, sky, job.frame) } : {}) });
    } catch (error) { reject(error as Error); }
  }, 0);
});

/** The Timestream's sky computer: a worker where one can be made, this thread where not, or once one fails. */
export function createSkyComputer(): SkyComputer {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./sky.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  if (!worker) return latestOnly(onThisThread);
  const pending = new Map<number, { resolve: (sky: SkyColumns) => void; reject: (error: Error) => void; job: SkyJob }>();
  let broken = false;
  worker.onmessage = (event: MessageEvent<SkyAnswer>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if ('error' in event.data) job.reject(new Error(event.data.error));
    else {
      const { longitudes, retrograde, columns, bodies, moonMarks: marks, graphs } = event.data;
      job.resolve({ longitudes, retrograde, columns, bodies, ...(marks ? { moonMarks: marks } : {}), ...(graphs ? { graphs } : {}) });
    }
  };
  worker.onerror = () => {
    // The worker could not run (a module it could not load, say): what it held is computed here instead.
    broken = true;
    worker?.terminate();
    for (const job of pending.values()) onThisThread(job.job).then(job.resolve, job.reject);
    pending.clear();
  };
  const computer = latestOnly((job) => (broken || !worker ? onThisThread(job) : new Promise((resolve, reject) => {
    pending.set(job.id, { resolve, reject, job });
    worker!.postMessage(job);
  })));
  return {
    compute: (request) => computer.compute(request),
    dispose: () => { computer.dispose(); worker?.terminate(); worker = null; },
  };
}
