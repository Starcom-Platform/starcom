import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCorrelationWorker } from '../useCorrelationWorker';
import { computeLocationConflicts, computeCorroboratedFindings } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

const BASE = Date.parse('2026-08-01T00:00:00Z');
const events: Event[] = [
  { id: 'c1', title: 'a', timestamp: new Date(BASE).toISOString(), category: 'G', tags: [], lat: 10, lon: 10, confidence: 0.8, sourceType: 'OBSERVATION', sourceId: 'src-c', entityRefs: ['Beta Ltd'] },
  { id: 'd1', title: 'b', timestamp: new Date(BASE + 3_600_000).toISOString(), category: 'G', tags: [], lat: 40, lon: 40, confidence: 0.8, sourceType: 'OBSERVATION', sourceId: 'src-d', entityRefs: ['Beta Ltd'] },
];

describe('useCorrelationWorker — the fallback must compute, never empty', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    // @ts-expect-error deliberately removing Worker to force the fallback
    delete globalThis.Worker;
  });
  afterEach(() => {
    if (originalWorker) globalThis.Worker = originalWorker;
  });

  it('computes on the main thread when no Worker exists', async () => {
    const { result } = renderHook(() => useCorrelationWorker(events));

    await waitFor(() => expect(result.current.computedBy).toBe('main-thread'));

    // The failure this guards: a correlation surface that silently empties
    // because a worker failed to start. An analyst would see no contradictions
    // and conclude there are none.
    expect(result.current.conflicts.length).toBeGreaterThan(0);
  });

  it('produces exactly the answer the synchronous functions produce', async () => {
    const { result } = renderHook(() => useCorrelationWorker(events));

    await waitFor(() => expect(result.current.computedBy).toBe('main-thread'));

    const expectedConflicts = computeLocationConflicts(events);
    expect(result.current.conflicts).toEqual(expectedConflicts);
    expect(result.current.findings).toEqual(computeCorroboratedFindings(events, expectedConflicts));
  });

  it('is never stale on the synchronous path, because there is nothing outstanding', async () => {
    const { result } = renderHook(() => useCorrelationWorker(events));
    await waitFor(() => expect(result.current.computedBy).toBe('main-thread'));
    expect(result.current.stale).toBe(false);
  });

  it('recomputes when the input changes', async () => {
    const { result, rerender } = renderHook(({ e }) => useCorrelationWorker(e), {
      initialProps: { e: events },
    });
    await waitFor(() => expect(result.current.conflicts.length).toBeGreaterThan(0));

    rerender({ e: [] });
    await waitFor(() => expect(result.current.conflicts).toHaveLength(0));
  });

  it('reports main-thread honestly rather than presenting it as equivalent to the worker', async () => {
    const { result } = renderHook(() => useCorrelationWorker(events));
    await waitFor(() => expect(result.current.computedBy).toBeDefined());
    // 'main-thread' means the work is blocking render. That is an operating
    // condition worth surfacing, not an implementation detail to hide.
    expect(result.current.computedBy).toBe('main-thread');
  });
});

describe('useCorrelationWorker — a worker that fails to construct', () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    if (originalWorker) globalThis.Worker = originalWorker;
    else { // @ts-expect-error restoring absence
      delete globalThis.Worker; }
  });

  it('falls back to computing rather than leaving the surface blank', async () => {
    // CSP, sandboxed contexts, and some embedded browsers all do this.
    globalThis.Worker = vi.fn(() => { throw new Error('blocked by CSP'); }) as unknown as typeof Worker;

    const { result } = renderHook(() => useCorrelationWorker(events));

    await waitFor(() => expect(result.current.computedBy).toBe('main-thread'));
    expect(result.current.conflicts.length).toBeGreaterThan(0);
  });
});
