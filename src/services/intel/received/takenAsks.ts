import type { ObjectiveAsk } from '../../exchange/types';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'TakenAsks' });
const LS_KEY = 'starcom_taken_asks_v1';

/**
 * The asks from other nodes' Mission Packages that a person here took on (plan
 * item 2.6, story S26).
 *
 * A received package is a statement by the node that signed it, and it is not
 * taken in as a record here (see useReceivedPackages). Taking on one of its
 * asks is a different thing: a decision made here, by the person, about work
 * they will do. So it is recorded, on this device, and sent nowhere. The
 * sender is not told: how a claim on an ask would cross is not agreed with
 * the peers that read these packages.
 *
 * Each entry keeps the words of the ask, because the package does not stay:
 * the receiver reads only the last day's packages, and holds them in memory.
 */
export interface TakenAsk {
  /** The key that signed the package: with the package id, which package this is. */
  signer: string;
  packageId: string;
  packageName: string;
  /** Where it arrived from. */
  relay: string;
  askId: string;
  ask: string;
  handsBack?: string;
  takenAt: string;
}

/** Which package an ask came from, as the receiver verified it. */
export type PackageRef = Pick<TakenAsk, 'signer' | 'packageId' | 'packageName' | 'relay'>;

export interface TakenAsksStore {
  load(): TakenAsk[];
  save(records: TakenAsk[]): void;
}

export class MemoryTakenAsksStore implements TakenAsksStore {
  private records: TakenAsk[] = [];
  load(): TakenAsk[] { return [...this.records]; }
  save(records: TakenAsk[]): void { this.records = [...records]; }
}

const isTakenAsk = (r: unknown): r is TakenAsk => {
  const t = r as TakenAsk | null;
  return !!t && typeof t === 'object'
    && [t.signer, t.packageId, t.askId, t.ask, t.takenAt].every((v) => typeof v === 'string');
};

export class BrowserTakenAsksStore implements TakenAsksStore {
  load(): TakenAsk[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isTakenAsk) : [];
    } catch {
      return [];
    }
  }

  save(records: TakenAsk[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
    } catch (err) {
      log.warn('Could not keep the asks taken on:', err instanceof Error ? err.message : String(err));
    }
  }
}

const keyOf = (pkg: Pick<PackageRef, 'signer' | 'packageId'>, askId: string) => `${pkg.signer}:${pkg.packageId}:${askId}`;

export class TakenAsks {
  private records = new Map<string, TakenAsk>();
  private listeners = new Set<() => void>();

  constructor(private store: TakenAsksStore = new MemoryTakenAsksStore()) {
    for (const r of this.store.load()) this.records.set(keyOf(r, r.askId), r);
  }

  /** Take an ask on. Taking it again keeps when it was first taken. */
  take(pkg: PackageRef, ask: ObjectiveAsk, at: string = new Date().toISOString()): TakenAsk {
    const key = keyOf(pkg, ask.id);
    const existing = this.records.get(key);
    if (existing) return existing;
    const record: TakenAsk = {
      signer: pkg.signer,
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      relay: pkg.relay,
      askId: ask.id,
      ask: ask.ask,
      ...(ask.handsBack ? { handsBack: ask.handsBack } : {}),
      takenAt: at,
    };
    this.records.set(key, record);
    this.persist();
    return record;
  }

  /** Let an ask go: it is no longer yours to do. */
  release(pkg: Pick<PackageRef, 'signer' | 'packageId'>, ask: Pick<ObjectiveAsk, 'id'>): void {
    if (this.records.delete(keyOf(pkg, ask.id))) this.persist();
  }

  get(pkg: Pick<PackageRef, 'signer' | 'packageId'>, ask: Pick<ObjectiveAsk, 'id'>): TakenAsk | undefined {
    return this.records.get(keyOf(pkg, ask.id));
  }

  isTaken(pkg: Pick<PackageRef, 'signer' | 'packageId'>, ask: Pick<ObjectiveAsk, 'id'>): boolean {
    return this.records.has(keyOf(pkg, ask.id));
  }

  all(): TakenAsk[] {
    return [...this.records.values()];
  }

  /** Told of every change: the package dialog and the attention queue both show these. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Test seam. */
  reset(): void {
    this.records.clear();
    this.persist();
  }

  private persist(): void {
    this.store.save(this.all());
    this.listeners.forEach((listener) => listener());
  }
}

export const takenAsks = new TakenAsks(
  typeof localStorage !== 'undefined' ? new BrowserTakenAsksStore() : new MemoryTakenAsksStore(),
);
