/**
 * Mecha Jono's live Psi Watch notes, from The Record (plan step 5a; the owner, 2 Nov): signed by their new key only
 * (PSI_SIGNER), by the `psi_watch` topic, in the three kinds the kit's notes use, and read from now (the owner, 3 Nov:
 * no waiting for the key change; PW12's "no relay read before it" withdrawn). Only that key ever signs a Psi note, so
 * the cut-over line in KEY_STARTS, which retires the old exposed key for every other reader (MX31), is not waited on
 * here. Only the newest of each address stands.
 *
 * The kit steps aside a family at a time (mergeKitAndLive): once a family has a live note, the kit's notes of that
 * family are no longer drawn; the others stand until theirs arrive.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { psiWatchRelays } from '../nostr/publishTargets';
import { familyOf, PSI_SIGNER, refusalOf, type PsiFamily, type PsiFixture, type PsiNote } from './psiEvents';
import type { KitFixture } from './kitFixtures';

/** The kinds Psi Watch's notes come in: long-form notes, mission packages, calendar events (the kit's). */
export const PSI_KINDS = [30023, 30079, 31923] as const;

export interface LiveNote extends PsiFixture {
  family: PsiFamily;
}
export interface LivePsiStatus {
  loaded: boolean;
  error: string | null;
}

const addressOf = (note: PsiNote) => `${note.kind}:${note.pubkey}:${note.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;

/** The newest note of each address, kept only if Psi Watch takes it and its key spoke when it was signed. */
export class LivePsiStore {
  private readonly byAddress = new Map<string, LiveNote>();

  accept(event: PsiNote): boolean {
    // The new key's own notes only (refusalOf): it is not exposed, and only it signs Psi notes.
    if (refusalOf(event) !== null) return false;
    const family = familyOf(event);
    if (!family) return false;
    const address = addressOf(event);
    const had = this.byAddress.get(address);
    if (had && had.event.created_at >= event.created_at) return false;
    this.byAddress.set(address, { event, family, provenance: { real: 'a live note on The Record' } });
    return true;
  }

  notes(): LiveNote[] {
    return [...this.byAddress.values()];
  }

  clear(): void {
    this.byAddress.clear();
  }
}

/**
 * What Psi Watch draws: the live notes, and the kit's for every family no live note has come for yet. A kit file keeps
 * its name; a live note is named by its address.
 */
export function mergeKitAndLive(kit: readonly KitFixture[], live: readonly LiveNote[]): KitFixture[] {
  if (live.length === 0) return [...kit];
  const liveFamilies = new Set(live.map((note) => note.family));
  return [
    ...kit.filter((fixture) => !liveFamilies.has(fixture.family)),
    ...live.map((note) => ({ ...note, file: addressOf(note.event) })),
  ];
}

// ── The read ────────────────────────────────────────────────────────────────
const store = new LivePsiStore();
const listeners = new Set<() => void>();
let snapshot: LiveNote[] = [];
let status: LivePsiStatus = { loaded: false, error: null };
let changed = false;
let reading: { close: () => void; users: number } | null = null;

const notify = () => listeners.forEach((listener) => listener());
const told = burst(() => {
  if (!changed) return;
  snapshot = store.notes();
  changed = false;
  notify();
});

/** The live notes standing now. The same list until it changes. */
export const livePsiNotes = (): LiveNote[] => snapshot;
export const livePsiStatus = (): LivePsiStatus => status;
export function subscribeLivePsi(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reads the live notes until the returned function is called; however many ask, one read is open. */
export function startLivePsi(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null };
    const pool = options.pool ?? createRelayPool();
    // A kind at a time, and every page of each: The Record returns 500 events per filter (readComplete.ts).
    const filters: Filter[] = PSI_KINDS.map((kind) => ({ kinds: [kind], authors: [PSI_SIGNER], '#t': ['psi_watch'] }));
    const read = readComplete(pool, options.relays ?? psiWatchRelays(), filters, {
      onevent: (event: Event) => {
        if (store.accept(event as unknown as PsiNote)) changed = true;
        told.soon();
      },
      oncomplete: () => {
        status = { loaded: true, error: null };
        changed = true;
        told.now();
      },
      onfail: (reasons) => {
        status = { loaded: false, error: `The Record could not be read: ${reasons.map((r) => r.reason).filter(Boolean).join('; ') || 'no answer'}` };
        changed = true;
        told.now();
      },
    });
    reading = { close: () => read.close(), users: 1 };
  }
  let stopped = false;
  return () => {
    if (stopped || !reading) return;
    stopped = true;
    reading.users -= 1;
    if (reading.users === 0) {
      reading.close();
      reading = null;
    }
  };
}

/**
 * The kit and the live notes together, as a card's loaders take them (useGlobeShareCard). The Record is read first, up
 * to `timeoutMs`, so a card made on a page with no Psi panel open still has the live notes.
 */
export async function loadPsiNotes(timeoutMs = 10_000): Promise<KitFixture[]> {
  const { loadPsiKit } = await import('./kitFixtures');
  const kit = await loadPsiKit();
  if (!status.loaded) {
    const stop = startLivePsi();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      const unsubscribe = subscribeLivePsi(() => { if (status.loaded || status.error) done(); });
      function done() { clearTimeout(timer); unsubscribe(); resolve(); }
      if (status.loaded || status.error) done();
    });
    stop();
  }
  return mergeKitAndLive(kit, livePsiNotes());
}

/** Test-only. */
export function resetLivePsiForTests(): void {
  snapshot = [];
  status = { loaded: false, error: null };
  reading?.close();
  reading = null;
  store.clear();
}
