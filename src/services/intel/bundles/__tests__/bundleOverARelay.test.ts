/**
 * A bundle sent over a relay (plan item 2.4, slice d; decision D1): Priya
 * sends a case to Aisha; the relay holds only gift wraps, signed by keys used
 * once and addressed to Aisha; Aisha's inbox keeps them, opens them, and the
 * case imports. Chen reads the same relay and finds nothing for him.
 *
 * Against a stand-in relay on this machine that asks everyone to sign in
 * (NIP-42), and that hands every reader everything it holds: the inbox must
 * keep only what is addressed to it.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterAll } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { standInRelay, stopStandInRelays } from '../../../nostr/__tests__/standInRelay';
import type { IntelReportData } from '../../../../types/IntelWorkspace';

function freshStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
async function wipeIndexedDb(): Promise<void> {
  for (const db of await indexedDB.databases()) {
    if (db.name) await new Promise((resolve) => { const req = indexedDB.deleteDatabase(db.name!); req.onsuccess = req.onerror = req.onblocked = () => resolve(null); });
  }
}
const until = async (check: () => Promise<boolean>, ms = 8_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

/** A machine: empty storage, fresh modules, the given key, and the team relay joined. */
async function machine(name: string, secret: Uint8Array, relay: { url: string; relayPubkey?: string }) {
  freshStorage();
  await wipeIndexedDb();
  vi.resetModules();
  const nostrService = (await import('../../../nostrService')).default;
  nostrService.importNsec(nip19.nsecEncode(secret));
  (await import('../../../identity/names')).setOwnName(name);
  (await import('../../../nostr/joinedRelays')).joinRelay({ url: relay.url, relayPubkey: relay.relayPubkey!, team: 'Newark desk' });
  const { intelWorkspaceManager } = await import('../../IntelWorkspaceManager');
  await intelWorkspaceManager.ensureInitialized();
  return {
    pubkey: getPublicKey(secret),
    workspace: intelWorkspaceManager,
    collect: await import('../collectBundle'),
    send: await import('../sendBundle'),
    inbox: await import('../bundleInbox'),
    sealed: await import('../../../nostr/sealedInbox'),
    importing: await import('../importBundle'),
  };
}

const report = (id: string, title: string): IntelReportData => ({
  id, title, type: 'INTEL_REPORT', summary: '', content: `${title}: what was seen.`, conclusions: [], recommendations: [],
  analysisType: 'OSINT', methodology: [], confidence: 0.6, sourceIntel: [], author: 'x', contributors: [],
  createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata: {},
});

afterAll(async () => { await stopStandInRelays(); });

describe('a bundle over a relay', () => {
  it('reaches only the person it was sealed to, who can import it; the relay learns neither sender nor content', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { name: 'Newark desk relay', supported_nips: [42] } });
    const priyaKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const chenKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);

    // Priya sends.
    const priya = await machine('Priya', priyaKey, relay);
    await priya.workspace.addReport(report('intel-berth4-cranes', 'Berth 4 cranes at night'));
    const created = await priya.workspace.addCase({
      title: 'Night loading at berth 4', description: 'Informant says the loading is for Vessel K.', sensitivity: 'protected', visibility: 'limited',
      relatedEntities: ['intel-berth4-cranes'],
    });
    const { file } = await priya.collect.makeBundleOf({ type: 'case', id: created.id });
    const sent = await priya.send.sendBundle(file, [aisha], [relay.url]);
    expect(sent).toEqual({ reached: [aisha], notReached: [] });

    const wraps = relay.held.filter((e) => e.kind === 1059);
    expect(wraps.length).toBeGreaterThanOrEqual(2);
    expect(wraps.every((w) => w.pubkey !== priya.pubkey && w.tags.some((t) => t[0] === 'p' && t[1] === aisha))).toBe(true);
    expect(JSON.stringify(relay.held)).not.toContain('Vessel K');
    expect(JSON.stringify(relay.held)).not.toContain('Night loading');

    // Aisha's inbox, signed in as her, keeps them and opens them.
    const a = await machine('Aisha', aishaKey, relay);
    const stop = a.sealed.startSealedInbox({ [20094]: a.inbox.keepBundlePart }, { relays: [relay.url] });
    expect(await until(async () => (await a.inbox.inboxSize()) === wraps.length)).toBe(true);
    stop();
    expect(relay.signIns.some((s) => s.pubkey === aisha)).toBe(true);
    const { bundles } = await a.inbox.receivedBundles();
    expect(bundles).toHaveLength(1);
    const [received] = bundles;
    if (received.state !== 'ready') throw new Error(JSON.stringify(received));
    expect(received.sender).toBe(priya.pubkey);
    expect(received.bundle.subject).toMatchObject({ type: 'case', id: created.id, title: 'Night loading at berth 4' });
    expect(await a.importing.applyImport(received.bundle)).toEqual({ added: 2, updated: 0, kept: 0 });
    expect(await a.workspace.decryptCaseDescription(created.id)).toBe('Informant says the loading is for Vessel K.');
    await a.inbox.dismissBundle(received);
    expect(await a.inbox.inboxSize()).toBe(0);

    // Chen reads the same relay, which hands him everything, and keeps nothing.
    const c = await machine('Chen', chenKey, relay);
    const stopChen = c.sealed.startSealedInbox({ [20094]: c.inbox.keepBundlePart }, { relays: [relay.url] });
    await new Promise((r) => setTimeout(r, 1_500));
    stopChen();
    expect(await c.inbox.inboxSize()).toBe(0);
    // Whatever hands it a wrap for someone else, the inbox does not keep it.
    expect(await c.sealed.acceptWrap(wraps[0], c.pubkey, { [20094]: c.inbox.keepBundlePart })).toBe(false);
    expect(await c.inbox.inboxSize()).toBe(0);
  }, 60_000);

  it('offers nothing until every part has arrived', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { supported_nips: [42] } });
    const priyaKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const priya = await machine('Priya', priyaKey, relay);
    const created = await priya.workspace.addCase({ title: 'Waiting case', description: 'Body.', visibility: 'limited' });
    const { file } = await priya.collect.makeBundleOf({ type: 'case', id: created.id });
    await priya.send.sendBundle(file, [getPublicKey(aishaKey)], [relay.url]);
    // One part lost on the way.
    const lost = relay.held.findIndex((e) => e.kind === 1059);
    relay.held.splice(lost, 1);

    const a = await machine('Aisha', aishaKey, relay);
    const stop = a.sealed.startSealedInbox({ [20094]: a.inbox.keepBundlePart }, { relays: [relay.url] });
    await until(async () => (await a.inbox.inboxSize()) > 0);
    await new Promise((r) => setTimeout(r, 300));
    stop();
    const { bundles } = await a.inbox.receivedBundles();
    expect(bundles).toEqual([expect.objectContaining({ state: 'waiting', have: 1, of: 2 })]);
  }, 60_000);

  it("refuses a bundle sealed by someone other than the person who signed it", async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { supported_nips: [42] } });
    const aishaKey = generateSecretKey();
    const priya = await machine('Priya', generateSecretKey(), relay);
    const created = await priya.workspace.addCase({ title: "Priya's case", description: 'Body.', visibility: 'limited' });
    const { file } = await priya.collect.makeBundleOf({ type: 'case', id: created.id });

    // Chen has Priya's file, and sends it on as if it were his to send.
    const chen = await machine('Chen', generateSecretKey(), relay);
    await chen.send.sendBundle(file, [getPublicKey(aishaKey)], [relay.url]);

    const a = await machine('Aisha', aishaKey, relay);
    const stop = a.sealed.startSealedInbox({ [20094]: a.inbox.keepBundlePart }, { relays: [relay.url] });
    await until(async () => (await a.inbox.inboxSize()) >= 2);
    stop();
    const { bundles } = await a.inbox.receivedBundles();
    expect(bundles).toEqual([expect.objectContaining({ state: 'refused', sender: chen.pubkey, reason: expect.stringMatching(/sealed by someone other than/) })]);
  }, 60_000);

  it('says who was not reached, and why, when no relay takes it', async () => {
    const relay = await standInRelay({ requiresSignIn: true, admits: () => false, nip11: { supported_nips: [42] } });
    const priya = await machine('Priya', generateSecretKey(), relay);
    const created = await priya.workspace.addCase({ title: 'Refused case', description: 'Body.', visibility: 'limited' });
    const { file } = await priya.collect.makeBundleOf({ type: 'case', id: created.id });
    const aisha = getPublicKey(generateSecretKey());
    expect(await priya.send.sendBundle(file, [aisha], [relay.url])).toEqual({
      reached: [], notReached: [{ pubkey: aisha, reason: expect.stringMatching(/No relay took it/) }],
    });
    expect(relay.held.filter((e) => e.kind === 1059)).toEqual([]);
  }, 60_000);

  it('listens with no key only if one exists: it never makes one', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { supported_nips: [42] } });
    freshStorage();
    await wipeIndexedDb();
    vi.resetModules();
    const nostrService = (await import('../../../nostrService')).default;
    nostrService.forgetIdentity();
    const sealed = await import('../../../nostr/sealedInbox');
    sealed.startSealedInbox({}, { relays: [relay.url] })();
    expect(nostrService.hasIdentity()).toBe(false);
    expect(relay.signIns).toEqual([]);
  });
});
