/**
 * Everything the ingest accepted reaches storage, including what it accepted
 * before anyone was listening.
 *
 * The third test is the one that matters. Persistence used to be owned by the
 * globe's effect, which subscribes long after the boot ingest has started, and
 * the ingest's replay path only ever re-DREW. Measured against a local relay
 * with three events published before the app opened: accepted 3, stored 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const store = vi.hoisted(() => ({ imported: [] as string[], fail: false, saved: [] as unknown[], deleted: [] as string[] }));
const ingest = vi.hoisted(() => ({
  listeners: new Set<(r: unknown) => void>(),
  withdrawnListeners: new Set<(ids: string[]) => void>(),
  held: [] as unknown[],
}));
const RETIRED = 'f'.repeat(64);

vi.mock('../../nostr/publisherKeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/publisherKeys')>()),
  retiredKey: (pubkey: string) => pubkey === RETIRED,
}));

vi.mock('../IntelReportService', () => ({
  intelReportService: {
    importReport: vi.fn(async (report: IntelReportUI) => {
      if (store.fail) throw new Error('storage refused');
      store.imported.push(report.id);
      return report;
    }),
    listReports: vi.fn(async () => store.saved),
    dropReadReport: vi.fn(async (id: string) => { store.deleted.push(id); }),
  },
}));

vi.mock('../NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    subscribe: (listener: (r: unknown) => void) => {
      ingest.listeners.add(listener);
      return () => ingest.listeners.delete(listener);
    },
    replayAccepted: (listener: (r: unknown) => void) => ingest.held.forEach((r) => listener(r)),
    onWithdrawn: (listener: (ids: string[]) => void) => {
      ingest.withdrawnListeners.add(listener);
      return () => ingest.withdrawnListeners.delete(listener);
    },
  },
}));

const report = (id: string): IntelReportUI => ({
  id, title: id, content: '', author: 'nostr', category: 'GEOINT', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'SUBMITTED',
} as unknown as IntelReportUI);

/** Fresh module state per test: the sink is a singleton with a `running` flag. */
const load = async () => {
  vi.resetModules();
  return import('../intelPersistenceSink');
};

describe('the intel persistence sink', () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    store.imported = [];
    store.fail = false;
    store.saved = [];
    store.deleted = [];
    ingest.listeners.clear();
    ingest.withdrawnListeners.clear();
    ingest.held = [];
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.useRealTimers();
  });

  it('stores a report the ingest emits', async () => {
    const { startIntelPersistence } = await load();
    dispose = startIntelPersistence();

    ingest.listeners.forEach((l) => l(report('live-1')));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.imported).toEqual(['live-1']);
  });

  it('stores what the ingest already held before it attached', async () => {
    // The regression this file exists for. The ingest starts at boot; anything
    // it took before a listener arrived was drawn and never written.
    ingest.held = [report('earlier-1'), report('earlier-2')];
    const { startIntelPersistence } = await load();
    dispose = startIntelPersistence();

    await vi.advanceTimersByTimeAsync(2000);

    expect(store.imported.sort()).toEqual(['earlier-1', 'earlier-2']);
  });

  it('counts a refused write instead of swallowing it', async () => {
    store.fail = true;
    const { startIntelPersistence, getIntelPersistenceMetrics } = await load();
    dispose = startIntelPersistence();

    ingest.listeners.forEach((l) => l(report('doomed')));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.imported).toEqual([]);
    expect(getIntelPersistenceMetrics().failed).toBe(1);
  });

  it('reports what it has written, so "accepted N, stored 0" is answerable', async () => {
    const { startIntelPersistence, getIntelPersistenceMetrics } = await load();
    dispose = startIntelPersistence();

    ingest.listeners.forEach((l) => l(report('a')));
    ingest.listeners.forEach((l) => l(report('b')));
    await vi.advanceTimersByTimeAsync(2000);

    expect(getIntelPersistenceMetrics().persisted).toBe(2);
    expect(getIntelPersistenceMetrics().pending).toBe(0);
  });

  it('writes nothing more once disposed', async () => {
    const { startIntelPersistence } = await load();
    const stop = startIntelPersistence();
    const listeners = [...ingest.listeners];
    stop();

    listeners.forEach((l) => l(report('after-teardown')));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.imported).toEqual([]);
  });

  it('does not attach twice, which would double every write', async () => {
    const { startIntelPersistence } = await load();
    dispose = startIntelPersistence();
    startIntelPersistence();

    ingest.listeners.forEach((l) => l(report('once')));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.imported).toEqual(['once']);
  });

  it('takes out of storage a report a note carried to its publisher\'s new key replaced (2 Nov key change)', async () => {
    const { startIntelPersistence, getIntelPersistenceMetrics } = await load();
    dispose = startIntelPersistence();
    ingest.withdrawnListeners.forEach((listener) => listener(['30023:old:d']));
    await vi.runAllTimersAsync();
    expect(store.deleted).toEqual(['30023:old:d']);
    expect(getIntelPersistenceMetrics().removed).toBe(1);
  });

  it('takes out the saved reports a retired key signed, and keeps the rest', async () => {
    store.saved = [{ ...report('by-retired'), author: RETIRED }, { ...report('by-new'), author: 'e'.repeat(64) }, report('local')];
    const { startIntelPersistence } = await load();
    dispose = startIntelPersistence();
    await vi.runAllTimersAsync();
    expect(store.deleted).toEqual(['by-retired']);
  });
});
