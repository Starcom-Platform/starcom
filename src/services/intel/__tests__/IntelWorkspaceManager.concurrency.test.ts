/**
 * Regression tests for a real concurrent-initialization race found while
 * auditing storage call sites for the same bug class as NetRunner's own
 * ensureInitialized() memoization.
 *
 * Before the fix: IntelWorkspaceManager.ensureInitialized() guarded with a
 * plain `if (this.state || this.initializing) return` boolean, and
 * IntelReportService's ensure() guarded with a plain `if (!this.initialized)`
 * boolean. Neither awaited the SAME in-flight promise across concurrent
 * callers — a second caller arriving before the first finished would return
 * immediately with `state` still unset, so any subsequent read
 * (getReports()/getState()) threw "Workspace not initialized". With 20+ live
 * call sites for listReports()/createReport() across the app, two firing
 * close together on a cold start was a real, not theoretical, scenario.
 *
 * Each test uses vi.resetModules() + a fresh dynamic import so the singleton
 * genuinely starts uninitialized — reusing the already-initialized module
 * singleton across tests would never re-exercise the cold-start race.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CreateIntelReportInput } from '../../../types/intel/IntelReportUI';

function makeInput(title: string): CreateIntelReportInput {
  return {
    title,
    content: 'test content',
    category: 'GENERAL',
    tags: ['concurrency-test'],
  } as CreateIntelReportInput;
}

/**
 * jsdom has no real `indexedDB`, so IntelWorkspaceManager's openIDB() rejects
 * essentially synchronously (the executor checks `typeof indexedDB ===
 * 'undefined'` and rejects immediately). That made the race window too
 * narrow for a plain back-to-back Promise.all() to reliably land — the first
 * caller's whole fallback chain (reject → catch → localStorage miss → empty
 * workspace) could complete in fewer microtask ticks than the second caller
 * needed to reach its own read. This installs a fake `indexedDB` whose
 * open() only settles after a real macrotask delay, forcing the async gap
 * wide enough to deterministically prove the race either reproduces or
 * doesn't — rather than depending on jsdom's specific fast-fail timing.
 */
function installSlowFakeIndexedDB(delayMs: number): () => void {
  const original = (globalThis as { indexedDB?: unknown }).indexedDB;
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const request: { onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: (() => void) | null; error: Error | null; result: null } = {
        onsuccess: null, onerror: null, onupgradeneeded: null, error: null, result: null
      };
      setTimeout(() => {
        request.error = new Error('simulated slow IndexedDB unavailability');
        request.onerror?.();
      }, delayMs);
      return request;
    }
  };
  return () => { (globalThis as { indexedDB?: unknown }).indexedDB = original; };
}

describe('IntelWorkspaceManager / IntelReportService — concurrent cold-start initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  });

  it('two concurrent listReports() calls on a cold start both resolve, neither throws "Workspace not initialized"', async () => {
    const restore = installSlowFakeIndexedDB(20);
    try {
      const { intelReportService } = await import('../IntelReportService');

      const results = await Promise.all([
        intelReportService.listReports(),
        intelReportService.listReports()
      ]);

      expect(results[0]).toEqual([]);
      expect(results[1]).toEqual([]);
    } finally {
      restore();
    }
  });

  it('a listReports() call racing a createReport() call on a cold start both succeed', async () => {
    const restore = installSlowFakeIndexedDB(20);
    try {
      const { intelReportService } = await import('../IntelReportService');

      const [list, created] = await Promise.all([
        intelReportService.listReports(),
        intelReportService.createReport(makeInput('Racing Report'), 'tester')
      ]);

      expect(Array.isArray(list)).toBe(true);
      expect(created.title).toBe('Racing Report');

      // The write must be durably visible afterward, not lost to the race.
      const after = await intelReportService.listReports();
      expect(after.some(r => r.id === created.id)).toBe(true);
    } finally {
      restore();
    }
  });

  it('ten concurrent createReport() calls on a cold start all succeed with distinct ids', async () => {
    const restore = installSlowFakeIndexedDB(20);
    try {
      const { intelReportService } = await import('../IntelReportService');

      const creations = Array.from({ length: 10 }, (_, i) =>
        intelReportService.createReport(makeInput(`Report ${i}`), 'tester')
      );
      const created = await Promise.all(creations);

      const ids = new Set(created.map(r => r.id));
      expect(ids.size).toBe(10); // no collisions, none silently dropped

      const list = await intelReportService.listReports();
      for (const id of ids) {
        expect(list.some(r => r.id === id)).toBe(true);
      }
    } finally {
      restore();
    }
  });

  it('the workspace change subscription is registered exactly once, even when ensure() is entered concurrently', async () => {
    const restore = installSlowFakeIndexedDB(20);
    try {
      const { intelReportService } = await import('../IntelReportService');

      // Two calls into the not-yet-initialized service, racing ensure() —
      // exactly the condition that used to register the subscription twice.
      await Promise.all([
        intelReportService.listReports(),
        intelReportService.listReports()
      ]);

      let notifyCount = 0;
      intelReportService.onChange(() => { notifyCount++; });

      await intelReportService.createReport(makeInput('Trigger'), 'tester');
      // The subscription callback re-lists asynchronously; give it a tick.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(notifyCount).toBe(1); // was 2 before the fix (double-subscribed)
    } finally {
      restore();
    }
  });
});
