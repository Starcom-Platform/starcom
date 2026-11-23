/// <reference lib="webworker" />
/**
 * The satellite catalogue propagated off the page's thread (D-GV GV2): the elements once, then each second the
 * whole catalogue at two moments, sent back as transferable arrays.
 */
import { propagateCatalog, satrecsOf, type OmmRecord } from './catalogPropagation';
import type { SatRec } from 'satellite.js';

export type CatalogJob =
  | { id: number; kind: 'load'; records: OmmRecord[] }
  | { id: number; kind: 'step'; timesMs: number[] };
export type CatalogAnswer =
  | { id: number; loaded: number; readable: number }
  | { id: number; timesMs: number[]; positions: Float32Array[]; heights: Float32Array }
  | { id: number; error: string };

let satrecs: Array<SatRec | null> = [];

self.onmessage = (event: MessageEvent<CatalogJob>) => {
  const job = event.data;
  try {
    if (job.kind === 'load') {
      satrecs = satrecsOf(job.records);
      const answer: CatalogAnswer = { id: job.id, loaded: satrecs.length, readable: satrecs.filter(Boolean).length };
      (self as unknown as Worker).postMessage(answer);
      return;
    }
    const n = satrecs.length;
    const heights = new Float32Array(n);
    const positions = job.timesMs.map((t, k) => {
      const out = new Float32Array(n * 3);
      propagateCatalog(satrecs, t, out, k === 0 ? heights : undefined);
      return out;
    });
    const answer: CatalogAnswer = { id: job.id, timesMs: job.timesMs, positions, heights };
    (self as unknown as Worker).postMessage(answer, [...positions.map((p) => p.buffer), heights.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id: job.id, error: (error as Error).message } satisfies CatalogAnswer);
  }
};
