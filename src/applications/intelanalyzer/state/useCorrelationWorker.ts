import { useEffect, useRef, useState } from 'react';
import type { Event } from '../adapters/eventsAdapter';
import {
  computeLocationConflicts,
  computeCorroboratedFindings,
  type LocationConflict,
  type CorroboratedFinding,
} from './correlationUtils';
import type { CorrelationRequest, CorrelationResponse } from './correlation.worker';

export interface CorrelationResult {
  conflicts: LocationConflict[];
  findings: CorroboratedFinding[];
  /**
   * How the current result was produced.
   *
   * 'main-thread' is not a failure to hide — it means the work is blocking
   * render, which is a real operating condition an operator or a developer
   * profiling a slow tab needs to be able to see. It is reported rather than
   * silently equivalent to the worker path.
   */
  computedBy: 'worker' | 'main-thread';
  /** True while a worker request is outstanding and the shown result is from a previous input. */
  stale: boolean;
}

/**
 * Runs correlation in a worker, falling back to synchronous computation when
 * Workers are unavailable (jsdom, SSR, a browser that refuses to construct
 * one).
 *
 * The fallback computes the SAME answer on the main thread rather than
 * returning nothing. A correlation surface that silently emptied itself
 * because a worker failed to start would be the "absence reads as a negative
 * finding" failure this codebase keeps having to fix — an analyst would see no
 * contradictions and conclude there are none.
 */
export function useCorrelationWorker(events: Event[]): CorrelationResult {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestHandledRef = useRef(0);

  const [result, setResult] = useState<{ conflicts: LocationConflict[]; findings: CorroboratedFinding[] }>(
    { conflicts: [], findings: [] }
  );
  const [computedBy, setComputedBy] = useState<'worker' | 'main-thread'>('main-thread');
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./correlation.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Worker construction can fail for reasons the caller cannot fix (CSP,
      // a sandboxed context). Staying on the main thread is correct here.
      return;
    }

    worker.onmessage = (e: MessageEvent<CorrelationResponse>) => {
      // Out-of-order or superseded responses are discarded. Filters can change
      // faster than a large corpus recomputes, and showing an older answer
      // against newer input would be worse than showing a stale flag.
      if (e.data.requestId < latestHandledRef.current) return;
      latestHandledRef.current = e.data.requestId;
      setResult({ conflicts: e.data.conflicts, findings: e.data.findings });
      setComputedBy('worker');
      setStale(false);
    };

    worker.onerror = () => {
      // Fall back rather than leaving the surface empty.
      worker.terminate();
      workerRef.current = null;
      setComputedBy('main-thread');
    };

    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;

    if (!worker) {
      // Synchronous path — same functions, same answer, on this thread.
      const conflicts = computeLocationConflicts(events);
      setResult({ conflicts, findings: computeCorroboratedFindings(events, conflicts) });
      setComputedBy('main-thread');
      setStale(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStale(true);
    // `reset` rather than `add`: this hook receives the FILTERED set, and a
    // filter change is a replacement, not an addition. Incremental adds happen
    // inside the worker's index across successive polls of the same filter.
    const message: CorrelationRequest = { type: 'reset', requestId, events };
    worker.postMessage(message);
  }, [events]);

  return { ...result, computedBy, stale };
}
