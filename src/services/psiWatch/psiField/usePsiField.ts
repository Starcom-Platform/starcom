/**
 * The ψ field at the cursor (decision D-PW, PW57, PW78–PW80), shared by the globe's layer, its side-by-side copy and
 * the panel: one worker, the inputs read once a visit while the layer shows (the base, and IGRF-14 as the magnetic
 * shield reads it), each moment computed once and the last few kept. The cursor's and now's requests each keep only
 * their latest, so a drag never queues a backlog and neither half waits on the other's. The moment is the cursor's
 * minute; the core's line, its whole year held to IGRF-14's span.
 */
import { useEffect, useState } from 'react';
import { loadShieldData, shieldYear } from '../shield/useShield';
import { psiFieldAt, PSI_BASE_URL, type PsiBase, type PsiFieldAt, type PsiFieldInputs } from './field';
import type { PsiFieldAnswer, PsiFieldJob } from './psiField.worker';

export type PsiFieldChannel = 'cursor' | 'now';

let inputs: Promise<PsiFieldInputs | null> | null = null;

/** The base and IGRF-14, read once a visit; a failed read is tried again next time. */
export const loadPsiInputs = (): Promise<PsiFieldInputs | null> => (inputs ??= Promise.all([
  fetch(PSI_BASE_URL).then((r) => (r.ok ? r.json() as Promise<PsiBase> : null)).catch(() => null),
  loadShieldData(),
]).then(([base, igrf]) => {
  if (!base || !igrf) { inputs = null; return null; }
  return { base, igrf: { epochs: igrf.epochs, terms: igrf.terms } };
}));

const KEPT = 6;
const results = new Map<string, PsiFieldAt>();
const waiters = new Map<string, Array<(field: PsiFieldAt | null) => void>>();
const queued = new Map<PsiFieldChannel, { key: string; timeMs: number; year: number }>();
let running: string | null = null;
let worker: Worker | null = null;
let workerHasInputs = false;
let workerBroken = false;
let nextId = 0;
const jobs = new Map<number, string>();

const keyOf = (timeMs: number, year: number) => `${timeMs}:${year}`;

function settle(key: string, field: PsiFieldAt | null): void {
  if (field) {
    results.set(key, field);
    while (results.size > KEPT) results.delete(results.keys().next().value as string);
  }
  const list = waiters.get(key) ?? [];
  waiters.delete(key);
  list.forEach((resolve) => resolve(field));
}

function finish(key: string, field: PsiFieldAt | null): void {
  settle(key, field);
  running = null;
  pump();
}

function startWorker(): Worker | null {
  if (worker || workerBroken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./psiField.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<PsiFieldAnswer>) => {
    const key = jobs.get(event.data.id);
    if (key === undefined) return;
    jobs.delete(event.data.id);
    finish(key, 'field' in event.data ? event.data.field : null);
  };
  worker.onerror = () => {
    // The worker could not run: what it held is computed here instead, and so is everything after.
    workerBroken = true;
    worker?.terminate();
    worker = null;
    const held = [...jobs.values()];
    jobs.clear();
    if (held.length && running) {
      const [time, year] = running.split(':').map(Number);
      void run(running, time, year);
    }
  };
  return worker;
}

async function run(key: string, timeMs: number, year: number): Promise<void> {
  const loaded = await loadPsiInputs();
  if (!loaded) { finish(key, null); return; }
  const w = startWorker();
  if (w) {
    const id = ++nextId;
    jobs.set(id, key);
    w.postMessage({ id, timeMs, year, ...(workerHasInputs ? {} : { inputs: loaded }) } satisfies PsiFieldJob);
    workerHasInputs = true;
    return;
  }
  setTimeout(() => {
    try { finish(key, psiFieldAt(loaded, timeMs, year)); } catch { finish(key, null); }
  }, 0);
}

function pump(): void {
  if (running) return;
  const next = queued.get('cursor') ?? queued.get('now');
  if (!next) return;
  for (const [channel, job] of queued) if (job.key === next.key) queued.delete(channel);
  running = next.key;
  void run(next.key, next.timeMs, next.year);
}

/** The field at a moment (to the minute) and a whole year; null when a newer request on the channel came first, or it failed. */
export function psiFieldFor(channel: PsiFieldChannel, timeMs: number, year: number): Promise<PsiFieldAt | null> {
  const key = keyOf(timeMs, year);
  const done = results.get(key);
  if (done) return Promise.resolve(done);
  return new Promise((resolve) => {
    waiters.set(key, [...(waiters.get(key) ?? []), resolve]);
    if (running === key) return;
    const replaced = queued.get(channel);
    if (replaced && replaced.key !== key && ![...queued].some(([c, job]) => c !== channel && job.key === replaced.key)) settle(replaced.key, null);
    queued.set(channel, { key, timeMs, year });
    pump();
  });
}

/** Test-only: forget every result, input and worker. */
export function resetPsiFieldStoreForTests(): void {
  results.clear(); waiters.clear(); queued.clear(); jobs.clear();
  running = null; inputs = null; worker?.terminate(); worker = null; workerHasInputs = false; workerBroken = false;
}

export interface PsiFieldState {
  /** The field drawn: the cursor's moment once computed, the one before until then; null before the first. */
  at: PsiFieldAt | null;
  /** The field shown is the moment asked for. */
  current: boolean;
  /** The inputs could not be read: tried again when the layer is next turned on. */
  failed: boolean;
  /** Where the cursor stood against IGRF-14's span, for the core's line. */
  clamped: 'before' | 'after' | null;
}

export function usePsiField(active: boolean, cursorMs: number, channel: PsiFieldChannel = 'cursor'): PsiFieldState {
  const minuteMs = Math.floor(cursorMs / 60_000) * 60_000;
  const { wholeYear, clamped } = shieldYear(cursorMs);
  const key = keyOf(minuteMs, wholeYear);
  const [at, setAt] = useState<PsiFieldAt | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void psiFieldFor(channel, minuteMs, wholeYear).then((field) => {
      if (!live) return;
      if (field) { setAt(field); setFailed(false); return; }
      // Passed over for a newer moment, or failed: only a failed read of the inputs is said.
      void loadPsiInputs().then((loaded) => { if (live && !loaded) setFailed(true); });
    });
    return () => { live = false; };
  }, [active, channel, minuteMs, wholeYear]);
  const shown = active ? at : null;
  return { at: shown, current: !!shown && keyOf(shown.timeMs, shown.year) === key, failed: active && failed, clamped };
}
