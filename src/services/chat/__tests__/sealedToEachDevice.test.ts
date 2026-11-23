/**
 * A direct message reaches each of the recipient's devices, post-quantum
 * (plan item 9.11, decision G2). Every device of a person published its
 * bundle at one address, so a sender sealed to whichever device came last,
 * and the other said the message could not be decrypted. Each device now
 * publishes at its own address, and the sender seals to each.
 *
 * Priya writes to Aisha, who has a laptop and a phone, each a machine of its
 * own holding the same key, and later adds a tablet. Through a stand-in relay
 * that is the chat relay: it keeps the prekey bundles too.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { unwrapEvent } from 'nostr-tools/nip59';
import { standInRelay, stopStandInRelays, type StandIn } from '../../nostr/__tests__/standInRelay';

/** One device: its browser storage and its IndexedDB, kept between visits. */
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
const NOT_HERE = 'This message was sealed to your other devices, not this one. Read it on one of them.';

/** The addresses this key's bundles are published at. */
const bundleAddresses = (pubkey: string) =>
  new Set(relay.held.filter((e) => e.kind === 30078 && e.pubkey === pubkey).map((e) => e.tags.find((t) => t[0] === 'd')?.[1] ?? ''));

/**
 * At this device: its storage, fresh modules, the person's key; chat started,
 * as every load of the app starts it, and its inbox listening. On a first
 * visit the device's own bundle is published, at an address no other device
 * of theirs has.
 */
async function machine(secret: Uint8Array, at: Device, firstVisit = true) {
  sitAt(at);
  vi.resetModules();
  const nostrService = (await import('../../nostrService')).default;
  nostrService.importNsec(nip19.nsecEncode(secret));
  const pubkey = getPublicKey(secret);
  const { secureChatIntegration } = await import('../../SecureChatIntegrationService');
  const sealedChat = await import('../sealedChat');
  const sealed = await import('../../nostr/sealedInbox');
  const { APP_KINDS } = await import('../../nostr/kindRegistry');
  const before = bundleAddresses(pubkey);
  await secureChatIntegration.initialize();
  // Each of them chats: they have used chat with this key, so it announces its bundle (MF15).
  secureChatIntegration.markChatUsed();
  if (firstVisit) expect(await until(() => [...bundleAddresses(pubkey)].some((d) => !before.has(d)))).toBe(true);
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

describe('a direct message to someone with several devices', () => {
  it('reaches each of them, post-quantum, in one wrap sealed to each', async () => {
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    const laptop = device();
    const phone = device();
    (await machine(aishaKey, laptop)).stop();
    (await machine(aishaKey, phone)).stop();
    expect([...bundleAddresses(aisha)].filter((d) => d.startsWith('pqc-prekey-bundle:'))).toHaveLength(2);

    const priya = await machine(generateSecretKey(), device());
    expect(await priya.chat.sendMessage(`dm-${aisha}`, 'Berth 4 again tonight?')).toMatchObject({ encrypted: true, postQuantum: true });
    priya.stop();

    expect(JSON.stringify(relay.held)).not.toContain('Berth 4 again');
    const wraps = relay.held.filter((e) => e.kind === 1059 && e.tags.some((t) => t[0] === 'p' && t[1] === aisha));
    expect(wraps).toHaveLength(1);
    const envelope = JSON.parse(unwrapEvent(wraps[0], aishaKey).content);
    expect(envelope.v).toBe(2);
    expect(envelope.devices).toHaveLength(2);

    for (const at of [laptop, phone]) {
      const a = await machine(aishaKey, at, false);
      expect(await until(() => a.received.length > 0)).toBe(true);
      expect(a.received[0]).toMatchObject({ senderId: priya.pubkey, content: 'Berth 4 again tonight?', postQuantum: true, decryptionFailed: false });
      a.stop();
    }
  }, 150_000);

  it('says, on a device added after it was sent, that it was sealed to the others, and reaches that device from then on', async () => {
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    const laptop = device();
    (await machine(aishaKey, laptop)).stop();

    const priyaKey = generateSecretKey();
    const priyaDevice = device();
    const priya = await machine(priyaKey, priyaDevice);
    expect(await priya.chat.sendMessage(`dm-${aisha}`, 'Gate code is 4471.')).toMatchObject({ postQuantum: true });
    priya.stop();

    const tabletDevice = device();
    const tablet = await machine(aishaKey, tabletDevice);
    expect(await until(() => tablet.received.length > 0)).toBe(true);
    expect(tablet.received[0]).toMatchObject({ senderId: priya.pubkey, content: NOT_HERE, decryptionFailed: true, postQuantum: false });
    tablet.stop();

    const back = await machine(aishaKey, laptop, false);
    expect(await until(() => back.received.some((m) => m.content === 'Gate code is 4471.'))).toBe(true);
    expect(back.received.find((m) => m.content === 'Gate code is 4471.')).toMatchObject({ postQuantum: true, decryptionFailed: false });
    back.stop();

    const again = await machine(priyaKey, priyaDevice, false);
    expect(await again.chat.sendMessage(`dm-${aisha}`, 'New code from Monday: 5582.')).toMatchObject({ postQuantum: true });
    again.stop();
    const tabletAgain = await machine(aishaKey, tabletDevice, false);
    expect(await until(() => tabletAgain.received.some((m) => m.content === 'New code from Monday: 5582.'))).toBe(true);
    expect(tabletAgain.received.find((m) => m.content === 'New code from Monday: 5582.')).toMatchObject({ postQuantum: true, decryptionFailed: false });
    tabletAgain.stop();
  }, 150_000);
});
