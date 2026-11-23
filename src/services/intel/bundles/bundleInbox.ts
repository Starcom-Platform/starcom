/**
 * Bundles sent to this person over relays (plan item 2.4).
 *
 * The sealed inbox (services/nostr/sealedInbox.ts) opens each gift wrap
 * addressed to this key and hands a bundle's parts here. They are kept as
 * they arrived, still encrypted, so nothing a teammate sent is kept readable
 * at rest; grouped by bundle and read with readBundle, a bundle is offered
 * only when every part is here and nothing in it was changed, and every part
 * was sealed by the person the bundle names as its sender.
 */
import type { Event } from 'nostr-tools';
import { unwrapGift, type Rumor } from '../../nostr/giftWrap';
import { unreadableWraps, type OpenedWrap } from '../../nostr/sealedInbox';
import { APP_KINDS } from '../../nostr/kindRegistry';
import { assemble, placeOf } from './bundleParts';
import { readBundle, type OpenedBundle } from '../../exchange/bundle';

interface StoredWrap { id: string; wrap: Event; receivedAt: number }

const IDB_NAME = 'starcom-bundle-inbox';
const IDB_STORE = 'wraps';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Where the wraps are kept: IndexedDB, or this session only when it is unavailable. */
const memory = new Map<string, StoredWrap>();
async function allWraps(): Promise<StoredWrap[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result as StoredWrap[]); };
      req.onerror = () => { db.close(); resolve([...memory.values()]); };
    });
  } catch {
    return [...memory.values()];
  }
}
async function writeWraps(put: StoredWrap[], remove: string[] = []): Promise<void> {
  put.forEach((w) => memory.set(w.id, w));
  remove.forEach((id) => memory.delete(id));
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      put.forEach((w) => tx.objectStore(IDB_STORE).put(w));
      remove.forEach((id) => tx.objectStore(IDB_STORE).delete(id));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // Kept in memory for this session.
  }
}

const listeners = new Set<() => void>();
export function subscribeInbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const changed = () => listeners.forEach((l) => l());

export type ReceivedBundle =
  | { bundleId: string; state: 'ready'; sender: string; bundle: OpenedBundle; wrapIds: string[] }
  | { bundleId: string; state: 'waiting'; sender: string; have: number; of: number; wrapIds: string[] }
  | { bundleId: string; state: 'refused'; sender: string; reason: string; wrapIds: string[] };

/** Opened wraps, this session only, so an extension is not asked twice. */
const opened = new Map<string, { rumor: Rumor; sender: string } | { refused: string }>();

/** The sealed inbox's handler for a bundle part: kept as it arrived, and what it holds remembered for this session. */
export async function keepBundlePart({ wrap, rumor, sender }: OpenedWrap): Promise<void> {
  if (rumor.kind !== APP_KINDS.RECORD_BUNDLE_PART || !placeOf(rumor)) return;
  opened.set(wrap.id, { rumor, sender });
  if ((await allWraps()).some((w) => w.id === wrap.id)) return;
  await writeWraps([{ id: wrap.id, wrap, receivedAt: Date.now() }]);
  changed();
}

/** Opens what the inbox holds and says, bundle by bundle, what can be imported. */
export async function receivedBundles(): Promise<{ bundles: ReceivedBundle[]; unreadable: string[] }> {
  const groups = new Map<string, { sender: string; parts: Rumor[]; wrapIds: string[]; senders: Set<string> }>();
  const unreadable: string[] = [];
  for (const { id, wrap } of await allWraps()) {
    const result = opened.get(id) ?? await unwrapGift(wrap);
    // Not kept when the key was locked (D-KL): it opens after the unlock, and the refusal was no verdict on it.
    if (!('locked' in result)) opened.set(id, result);
    if ('refused' in result) { unreadable.push(result.refused); continue; }
    const place = result.rumor.kind === APP_KINDS.RECORD_BUNDLE_PART ? placeOf(result.rumor) : null;
    if (!place) continue;
    const group = groups.get(place.bundleId) ?? { sender: result.sender, parts: [], wrapIds: [], senders: new Set<string>() };
    group.parts.push(result.rumor);
    group.wrapIds.push(id);
    group.senders.add(result.sender);
    groups.set(place.bundleId, group);
  }

  const bundles: ReceivedBundle[] = [];
  for (const [bundleId, group] of groups) {
    const base = { bundleId, sender: group.sender, wrapIds: group.wrapIds };
    const distinct = [...new Map(group.parts.map((p) => [placeOf(p)!.index, p])).values()];
    const file = assemble(distinct);
    if (!file) {
      bundles.push({ ...base, state: 'waiting', have: distinct.length, of: placeOf(group.parts[0])!.of });
      continue;
    }
    const read = await readBundle(file);
    if ('refused' in read) { bundles.push({ ...base, state: 'refused', reason: read.refused }); continue; }
    if (group.senders.size !== 1 || !group.senders.has(read.bundle.from)) {
      bundles.push({ ...base, state: 'refused', reason: 'Parts of this bundle were sealed by someone other than the person who signed it.' });
      continue;
    }
    bundles.push({ ...base, state: 'ready', bundle: read.bundle });
  }
  return { bundles, unreadable: [...unreadable, ...unreadableWraps()] };
}

/** Removes a bundle's wraps from the inbox, once it is imported or not wanted. */
export async function dismissBundle(received: Pick<ReceivedBundle, 'wrapIds'>): Promise<void> {
  received.wrapIds.forEach((id) => opened.delete(id));
  await writeWraps([], received.wrapIds);
  changed();
}

/** How many wraps are waiting, without opening any. */
export async function inboxSize(): Promise<number> {
  return (await allWraps()).length;
}
