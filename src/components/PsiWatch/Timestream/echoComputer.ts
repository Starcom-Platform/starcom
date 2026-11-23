/**
 * Where Echoes' returns are found (decision D-PW, PW47): in a worker, or on the page's thread a moment later where a
 * worker cannot be made (a sandbox, a test) or once one fails. A newer request replaces one still being worked on:
 * the older answers null.
 */
import { returnsOf } from '../../../services/psiWatch/timestream/echoReturns';
import type { EchoAnswer, EchoJob } from './echo.worker';

export type EchoRequest = Omit<EchoJob, 'id'>;

export interface EchoComputer {
  /** The returns, oldest first, or null when a newer request came first. */
  compute(request: EchoRequest): Promise<number[] | null>;
  dispose(): void;
}

const onThisThread = (job: EchoJob): Promise<number[]> => new Promise((resolve, reject) => {
  setTimeout(() => {
    try { resolve(returnsOf(job.event, job.fromMs, job.untilMs, job.frame)); } catch (error) { reject(error as Error); }
  }, 0);
});

export function createEchoComputer(): EchoComputer {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./echo.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  let next = 0;
  let latest = 0;
  const pending = new Map<number, { resolve: (returns: number[] | null) => void; job: EchoJob }>();
  const answer = (id: number, returns: number[] | null) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    job.resolve(id === latest ? returns : null);
  };
  const runHere = (job: EchoJob) => onThisThread(job).then((r) => answer(job.id, r), () => answer(job.id, []));
  if (worker) {
    worker.onmessage = (event: MessageEvent<EchoAnswer>) => answer(event.data.id, 'returns' in event.data ? event.data.returns : []);
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const { job } of pending.values()) void runHere(job);
    };
  }
  return {
    compute(request) {
      const job: EchoJob = { id: ++next, ...request };
      latest = job.id;
      // Any older request still out answers null when it lands.
      for (const [id, older] of pending) if (id !== job.id) { pending.delete(id); older.resolve(null); }
      return new Promise((resolve) => {
        pending.set(job.id, { resolve, job });
        if (worker) worker.postMessage(job); else void runHere(job);
      });
    },
    dispose() {
      for (const { resolve } of pending.values()) resolve(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
