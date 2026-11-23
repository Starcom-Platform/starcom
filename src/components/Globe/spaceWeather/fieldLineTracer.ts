/**
 * Where the magnetosphere is traced (space-weather-visualization.md, SW4, SW5, SW13): in a worker, and
 * on the page's thread, a moment later, where a worker cannot be made (a sandbox, a test).
 */
import { traceFieldLines, type FieldLineRequest, type TracedFieldLine } from './fieldLines';
import { traceCusps, type CuspRequest, type Cusps } from './cusps';
import { traceTailSheet, type SheetRequest, type TailSheet } from './tailSheet';
import type { FieldLineAnswer, FieldLineJob } from './fieldLines.worker';

export interface FieldLineTracer {
  trace(request: FieldLineRequest): Promise<TracedFieldLine[]>;
  traceCusps(request: CuspRequest): Promise<Cusps>;
  traceTailSheet(request: SheetRequest): Promise<TailSheet>;
  dispose(): void;
}

const later = <T>(work: () => T): Promise<T> => new Promise((resolve, reject) => {
  setTimeout(() => {
    try { resolve(work()); } catch (error) { reject(error); }
  }, 0);
});

/** Traces on the page's thread, after the current frame. */
export function mainThreadTracer(): FieldLineTracer {
  return {
    trace: (request) => later(() => traceFieldLines(request)),
    traceCusps: (request) => later(() => traceCusps(request)),
    traceTailSheet: (request) => later(() => traceTailSheet(request)),
    dispose: () => undefined,
  };
}

/** Traces in a worker; a worker that cannot be made, or fails, gives way to the page's thread. */
export function createFieldLineTracer(): FieldLineTracer {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./fieldLines.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  if (!worker) return mainThreadTracer();
  const fallback = mainThreadTracer();
  type Waiting = { resolve: (answer: FieldLineAnswer) => void; reject: (error: Error) => void; job: FieldLineJob };
  const waiting = new Map<number, Waiting>();
  let next = 0;
  let broken = false;
  // A job done here instead, answered as the worker would have.
  const here = (job: FieldLineJob): Promise<FieldLineAnswer> => (job.kind === 'cusps'
    ? fallback.traceCusps(job.request).then((cusps) => ({ id: job.id, cusps }))
    : job.kind === 'sheet'
      ? fallback.traceTailSheet(job.request).then((sheet) => ({ id: job.id, sheet }))
      : fallback.trace(job.request).then((lines) => ({ id: job.id, lines })));
  worker.onmessage = (event: MessageEvent<FieldLineAnswer>) => {
    const job = waiting.get(event.data.id);
    if (!job) return;
    waiting.delete(event.data.id);
    if ('error' in event.data) job.reject(new Error(event.data.error));
    else job.resolve(event.data);
  };
  worker.onerror = () => {
    // The worker could not run (a module it could not load, say): what it held is traced here instead.
    broken = true;
    worker?.terminate();
    for (const job of waiting.values()) here(job.job).then(job.resolve, job.reject);
    waiting.clear();
  };
  const send = (job: Omit<FieldLineJob, 'id'>): Promise<FieldLineAnswer> => {
    const id = ++next;
    const full = { ...job, id } as FieldLineJob;
    if (broken || !worker) return here(full);
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, job: full });
      worker!.postMessage(full);
    });
  };
  return {
    trace: (request) => send({ request }).then((answer) => ('lines' in answer ? answer.lines : [])),
    traceCusps: (request) => send({ kind: 'cusps', request }).then((answer) => {
      if (!('cusps' in answer)) throw new Error('the worker answered without the cusps');
      return answer.cusps;
    }),
    traceTailSheet: (request) => send({ kind: 'sheet', request }).then((answer) => {
      if (!('sheet' in answer)) throw new Error('the worker answered without the sheet');
      return answer.sheet;
    }),
    dispose() {
      worker?.terminate();
      waiting.clear();
    },
  };
}
