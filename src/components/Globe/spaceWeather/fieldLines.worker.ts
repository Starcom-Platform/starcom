/// <reference lib="webworker" />
/**
 * Traces the magnetosphere off the page's thread (space-weather-visualization.md, SW4, SW5, SW13): a
 * set of field lines, the cusps, or the tail's current sheet, each a fraction of a second to a second,
 * too long to hold a frame.
 */
import { traceFieldLines, type FieldLineRequest, type TracedFieldLine } from './fieldLines';
import { traceCusps, type CuspRequest, type Cusps } from './cusps';
import { traceTailSheet, type SheetRequest, type TailSheet } from './tailSheet';

export type FieldLineJob =
  | { id: number; kind?: 'lines'; request: FieldLineRequest }
  | { id: number; kind: 'cusps'; request: CuspRequest }
  | { id: number; kind: 'sheet'; request: SheetRequest };
export type FieldLineAnswer = { id: number; lines: TracedFieldLine[] } | { id: number; cusps: Cusps } | { id: number; sheet: TailSheet } | { id: number; error: string };

self.onmessage = (event: MessageEvent<FieldLineJob>) => {
  const job = event.data;
  let answer: FieldLineAnswer;
  try {
    answer = job.kind === 'cusps' ? { id: job.id, cusps: traceCusps(job.request) }
      : job.kind === 'sheet' ? { id: job.id, sheet: traceTailSheet(job.request) }
        : { id: job.id, lines: traceFieldLines(job.request) };
  } catch (error) {
    answer = { id: job.id, error: (error as Error).message };
  }
  (self as unknown as Worker).postMessage(answer);
};
