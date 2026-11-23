/**
 * A direct message, sealed (plan item 2.7, slice a). It was addressed to
 * `dm-<key>`, which is nobody's key, so the recipient's post-quantum bundle
 * was never found, the text went out as a public kind 42, and nothing
 * listened for it. Now it goes to the recipient's key as the ML-KEM envelope
 * inside a gift wrap, and their sealed inbox opens it.
 *
 * Priya, Aisha and Chen, each a machine of their own, through a stand-in
 * relay that is the chat relay: it keeps the prekey bundles too.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { standInRelay, stopStandInRelays, type StandIn } from '../../nostr/__tests__/standInRelay';

/** A person's own machine: their browser storage and their IndexedDB, kept between visits. */
interface Device { storage: Map<string, string>; idb: IDBFactory }
const device = (): Device => ({ storage: new Map(), idb: new IDBFactory() });
function sitAt({ storage, idb }: Device): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => { storage.clear(); },
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = idb;
}
const until = async (check: () => boolean | Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

let relay: StandIn;

/** What this machine shows after a reload: fresh modules, the same storage. */
async function afterReload(): Promise<Array<import('../sealedChat').SealedChatMessage>> {
  vi.resetModules();
  const { subscribeSealedChat } = await import('../sealedChat');
  const seen: Array<import('../sealedChat').SealedChatMessage> = [];
  const stop = subscribeSealedChat((m) => { seen.push(m); });
  await until(() => seen.length > 0, 3_000);
  stop();
  return seen;
}

/** At this person's machine: their storage, fresh modules, their key; chat started and their bundle published. */
async function machine(secret: Uint8Array, at: Device, publishBundle = true) {
  sitAt(at);
  vi.resetModules();
  const nostrService = (await import('../../nostrService')).default;
  nostrService.importNsec(nip19.nsecEncode(secret));
  const pubkey = getPublicKey(secret);
  const { secureChatIntegration } = await import('../../SecureChatIntegrationService');
  const sealedChat = await import('../sealedChat');
  const sealed = await import('../../nostr/sealedInbox');
  const { APP_KINDS } = await import('../../nostr/kindRegistry');
  if (publishBundle) {
    await secureChatIntegration.initialize();
    // Each of them chats: they have used chat with this key, so it announces its bundle (MF15).
    secureChatIntegration.markChatUsed();
    expect(await until(() => relay.held.some((e) => e.kind === 30078 && e.pubkey === pubkey))).toBe(true);
  }
  const received: Array<import('../sealedChat').SealedChatMessage> = [];
  const stopListening = sealedChat.subscribeSealedChat((message) => { received.push(message); });
  const stopInbox = sealed.startSealedInbox({ [APP_KINDS.CHAT_MESSAGE]: (opened) => secureChatIntegration.receiveSealed(opened) }, { relays: [relay.url] });
  return { pubkey, chat: secureChatIntegration, received, stop: () => { stopListening(); stopInbox(); } };
}

beforeAll(async () => {
  relay = await standInRelay({ requiresSignIn: false });
  process.env.VITE_NOSTR_CHAT_RELAYS = relay.url;
  process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
});
afterAll(async () => {
  delete process.env.VITE_NOSTR_CHAT_RELAYS;
  delete process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE;
  await stopStandInRelays();
});

describe('a direct message', () => {
  it('reaches its recipient post-quantum and sealed, never as text on the wire; a third key reads nothing', async () => {
    const aishaKey = generateSecretKey();
    const chenKey = generateSecretKey();
    const aishaDevice = device();
    const aishaSetup = await machine(aishaKey, aishaDevice);
    aishaSetup.stop();
    const aisha = aishaSetup.pubkey;

    const priya = await machine(generateSecretKey(), device());
    const sent = await priya.chat.sendMessage(`dm-${aisha}`, 'Berth 4 again tonight?');
    expect(sent).toMatchObject({ encrypted: true, postQuantum: true });
    priya.stop();
    // Priya's own copy is kept: no copy is sealed back to her, and a reload must not lose it.
    expect(await afterReload()).toEqual([expect.objectContaining({ senderId: priya.pubkey, recipients: [aisha], content: 'Berth 4 again tonight?' })]);

    expect(relay.held.some((e) => e.kind === 42 || e.kind === 4)).toBe(false);
    expect(JSON.stringify(relay.held)).not.toContain('Berth 4 again');
    const wraps = relay.held.filter((e) => e.kind === 1059);
    expect(wraps.length).toBe(1);
    expect(wraps[0].tags).toEqual([['p', aisha]]);
    expect(wraps[0].pubkey).not.toBe(priya.pubkey);

    const a = await machine(aishaKey, aishaDevice, false);
    expect(await until(() => a.received.length > 0)).toBe(true);
    expect(a.received[0]).toMatchObject({ senderId: priya.pubkey, content: 'Berth 4 again tonight?', postQuantum: true, decryptionFailed: false, recipients: [aisha] });
    a.stop();

    const c = await machine(chenKey, device(), false);
    await new Promise((r) => setTimeout(r, 800));
    expect(c.received).toEqual([]);
    c.stop();
  }, 90_000);

  it('is still sealed when the recipient has published no post-quantum key, and says it is not post-quantum', async () => {
    const noBundleKey = generateSecretKey();
    const noBundle = getPublicKey(noBundleKey);
    const priya = await machine(generateSecretKey(), device());
    const sent = await priya.chat.sendMessage(`dm-${noBundle}`, 'Are you there?');
    expect(sent).toMatchObject({ encrypted: true, postQuantum: false });
    priya.stop();
    expect(JSON.stringify(relay.held)).not.toContain('Are you there?');

    const r = await machine(noBundleKey, device(), false);
    expect(await until(() => r.received.some((m) => m.content === 'Are you there?'))).toBe(true);
    expect(r.received.find((m) => m.content === 'Are you there?')).toMatchObject({ postQuantum: false, senderId: priya.pubkey });
    r.stop();
  }, 90_000);

  it('announces nothing for a key made after the app started until its person uses chat, then can reach them post-quantum', async () => {
    // Aisha opens the app with no key; it is made later, as a first report or joining a team makes it.
    const aishaDevice = device();
    sitAt(aishaDevice);
    vi.resetModules();
    const nostrService = (await import('../../nostrService')).default;
    nostrService.forgetIdentity();
    const { secureChatIntegration } = await import('../../SecureChatIntegrationService');
    await secureChatIntegration.initialize();
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    expect(relay.held.some((e) => e.kind === 30078 && e.pubkey === aisha)).toBe(false);
    nostrService.importNsec(nip19.nsecEncode(aishaKey));
    // Prepared for reading what arrives, and announced nowhere (MF15): no relay sees the new key's chat
    // material arrive beside the first thing it signed.
    const prepared = () => (secureChatIntegration as unknown as { localBundlePromise: Promise<unknown> | null }).localBundlePromise;
    expect(await until(() => prepared() !== null)).toBe(true);
    await prepared();
    await new Promise((r) => setTimeout(r, 300));
    expect(relay.held.some((e) => e.kind === 30078 && e.pubkey === aisha)).toBe(false);
    // She opens a conversation, or sends: from then on her bundle is announced.
    secureChatIntegration.markChatUsed();
    expect(await until(() => relay.held.some((e) => e.kind === 30078 && e.pubkey === aisha))).toBe(true);

    const priya = await machine(generateSecretKey(), device());
    expect(await priya.chat.sendMessage(`dm-${aisha}`, 'Welcome to the team.')).toMatchObject({ postQuantum: true });
    priya.stop();
  }, 90_000);
});
