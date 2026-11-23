/**
 * A message to someone with several devices is sealed to each (plan item
 * 9.11, decision G2).
 *
 * Every device of a person published its bundle at one address, and a sender
 * sealed to whichever came last, so each device broke the other's
 * post-quantum messages. Now the text is encrypted once, under a key made for
 * the message, and that key is sealed to each device, which finds its own.
 * Someone none of whose devices has its own address yet still gets the
 * envelope every version reads.
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as the other
 * SecureChatIntegrationService suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

vi.mock('../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));

const { fetchPrekeyBundles, publishPrekeyBundle } = vi.hoisted(() => ({ fetchPrekeyBundles: vi.fn(), publishPrekeyBundle: vi.fn() }));
vi.mock('../crypto/PQCKeyPublisher', () => ({ fetchPrekeyBundles, publishPrekeyBundle }));
beforeEach(() => { publishPrekeyBundle.mockResolvedValue(null); });

import { SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { prekeyBundleStore, type LocalPrekeyBundleSecrets } from '../crypto/PrekeyBundleStore';
import { ForwardSecrecyService } from '../crypto/ForwardSecrecyService';
import { PQCryptoService } from '../crypto/PQCryptoService';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { makeRumor, wrapRumor } from '../nostr/giftWrap';
import { APP_KINDS } from '../nostr/kindRegistry';

const service = SecureChatIntegrationService.getInstance();
const NOT_HERE = 'This message was sealed to your other devices, not this one. Read it on one of them.';
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

interface Entry {
  device: string; key: string; sessionId: string; ltCiphertext: string; spkCiphertext: string;
  otkCiphertext?: string; otkIndex?: number;
}
interface Envelope { v: number; ciphertext: string; devices: Entry[] }

/** A device of someone else's: the bundle it published, and the secrets only it holds. */
const aDevice = () => new ForwardSecrecyService().generatePrekeyBundle('peer-pubkey');

/** What one device does with its entry: makes the session's key, opens the message's key with it, then the text. */
async function openAs(envelope: Envelope, entry: Entry, secrets: LocalPrekeyBundleSecrets): Promise<string> {
  const sessionKey = await new ForwardSecrecyService().acceptSession(
    entry.sessionId,
    fromBase64(entry.ltCiphertext),
    fromBase64(entry.spkCiphertext),
    secrets.identityPrivateKey,
    secrets.signedPrekeyPrivateKey,
    entry.otkCiphertext ? fromBase64(entry.otkCiphertext) : undefined,
    entry.otkIndex !== undefined ? secrets.oneTimePrekeyPrivateKeys[entry.otkIndex] : undefined,
  );
  const pqc = PQCryptoService.getInstance();
  const messageKey = await pqc.decryptData(fromBase64(entry.key), sessionKey);
  return new TextDecoder().decode(await pqc.decryptData(fromBase64(envelope.ciphertext), messageKey));
}

/** This browser, as a recipient: its key, and its own bundle with no one-time prekeys, so no test spends one another needs. */
async function thisDevice() {
  const identity = nostrIdentityService.ensureLocalIdentity('a test recipient');
  const { bundle, deviceId } = await prekeyBundleStore.getOrCreateLocalBundle(identity, new ForwardSecrecyService());
  return { identity, deviceId, bundle: { ...bundle, oneTimePrekeys: [] } };
}

const open = (content: string) => service.processIncomingMessage({ content, pqcEncrypted: true, senderId: 'pk-sender', timestamp: Date.now() }, 'direct');

describe('a message sealed to each of the recipient’s devices', () => {
  it('encrypts the text once, and seals its key to each device, most recently seen first', async () => {
    const newer = await aDevice();
    const older = await aDevice();
    fetchPrekeyBundles.mockResolvedValue([{ device: 'dev-new', bundle: newer.bundle }, { device: 'dev-old', bundle: older.bundle }]);

    const sealed = await service.encryptFor('peer-pubkey', 'Berth 4 at 02:00.');

    expect(sealed.postQuantum).toBe(true);
    expect(sealed.content).not.toContain('Berth 4');
    const envelope = JSON.parse(sealed.content) as Envelope;
    expect(envelope.v).toBe(2);
    expect(envelope.devices.map((d) => d.device)).toEqual(['dev-new', 'dev-old']);
    expect(envelope.devices.some((d) => 'ciphertext' in d)).toBe(false);
    expect(await openAs(envelope, envelope.devices[0], newer.secrets)).toBe('Berth 4 at 02:00.');
    expect(await openAs(envelope, envelope.devices[1], older.secrets)).toBe('Berth 4 at 02:00.');
    // Neither device can open the other's.
    await expect(openAs(envelope, envelope.devices[1], newer.secrets)).rejects.toThrow();
  });

  it('keeps the envelope every version reads for someone none of whose devices has its own address', async () => {
    const me = await thisDevice();
    fetchPrekeyBundles.mockResolvedValue([{ device: null, bundle: me.bundle }]);

    const sealed = await service.encryptFor(me.identity, 'Checking by phone at 10.');

    const envelope = JSON.parse(sealed.content);
    expect(envelope.v).toBe(1);
    expect(envelope.devices).toBeUndefined();
    expect(envelope.ltCiphertext).toMatch(/^[0-9a-f]+$/);
    expect(await open(sealed.content)).toMatchObject({ content: 'Checking by phone at 10.', metadata: { decryptionFailed: false } });
  });

  it('opens, on this device, what was sealed to it among others', async () => {
    const me = await thisDevice();
    const phone = await aDevice();
    fetchPrekeyBundles.mockResolvedValue([{ device: 'dev-phone', bundle: phone.bundle }, { device: me.deviceId, bundle: me.bundle }]);

    const sealed = await service.encryptFor(me.identity, 'Cranes from 02:00.');

    expect(await open(sealed.content)).toMatchObject({ content: 'Cranes from 02:00.', metadata: { decryptionFailed: false } });
  });

  it('says a message sealed only to the other devices was sealed to them, not this one', async () => {
    const me = await thisDevice();
    const phone = await aDevice();
    fetchPrekeyBundles.mockResolvedValue([{ device: 'dev-phone', bundle: phone.bundle }]);

    const sealed = await service.encryptFor(me.identity, 'Read this on the phone.');

    const opened = await open(sealed.content);
    expect(opened).toMatchObject({ content: NOT_HERE, metadata: { decryptionFailed: true } });
    expect(opened!.content).not.toContain('Read this');
  });

  it('reads one that arrives on a channel', async () => {
    const me = await thisDevice();
    fetchPrekeyBundles.mockResolvedValue([{ device: me.deviceId, bundle: me.bundle }]);
    const sealed = await service.encryptFor(me.identity, 'On the channel.');
    const nostrService = (service as unknown as { nostrService: { getChannelMessages: (channelId: string) => unknown[] } }).nostrService;
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([{
      id: 'evt_each', teamId: '', channelId: 'ch-each', senderId: 'pk-sender', senderDID: 'did:nostr:pk-sender',
      senderAgency: '', content: sealed.content, messageType: 'text', timestamp: Date.now(), encrypted: false, pqcEncrypted: false,
    }]);

    const [message] = await service.getMessages('ch-each');

    expect(message).toMatchObject({ content: 'On the channel.', encrypted: true });
  });
});

describe('one-time keys spent on this device', () => {
  it('republishes its bundle under its own name once enough are spent', async () => {
    const identity = nostrIdentityService.ensureLocalIdentity('a test recipient');
    const { bundle, deviceId } = await prekeyBundleStore.getOrCreateLocalBundle(identity, new ForwardSecrecyService());
    fetchPrekeyBundles.mockResolvedValue([{ device: deviceId, bundle }]);
    publishPrekeyBundle.mockClear();
    // Each message spends the next one-time key, as ten senders' would.
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 10; i++) {
      random.mockReturnValue((i + 0.5) / bundle.oneTimePrekeys.length);
      const sealed = await service.encryptFor(identity, `Message ${i}.`);
      expect(await open(sealed.content)).toMatchObject({ content: `Message ${i}.`, metadata: { decryptionFailed: false } });
    }
    random.mockRestore();

    const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);
    await vi.waitFor(() => {
      const replenished = publishPrekeyBundle.mock.calls.find(([published, device]) =>
        device === deviceId && published.identity === identity && !same(published.oneTimePrekeys[0], bundle.oneTimePrekeys[0]));
      expect(replenished).toBeTruthy();
    });
  });
});

describe('a key brought to this device', () => {
  // The service held the bundle of the key it first saw, and went on handing it
  // out after another key replaced it here: the new key never had a bundle.
  it("gets a bundle of its own, published under this device's same name", async () => {
    const before = await thisDevice();
    await open('{}');
    publishPrekeyBundle.mockClear();

    const brought = generateSecretKey();
    nostrIdentityService.importNsec(nip19.nsecEncode(brought));
    // Announced once the person uses chat with it (MF15).
    service.markChatUsed();
    await open('{}');

    expect(publishPrekeyBundle).toHaveBeenCalledWith(expect.objectContaining({ identity: getPublicKey(brought) }), before.deviceId);
  });
});

describe('what fits one wrap', () => {
  const FIVE = ['dev-0', 'dev-1', 'dev-2', 'dev-3', 'dev-4'];

  it('seals a short message to all five devices', async () => {
    const one = await aDevice();
    fetchPrekeyBundles.mockResolvedValue(FIVE.map((device) => ({ device, bundle: one.bundle })));
    const envelope = JSON.parse((await service.encryptFor('peer-pubkey', 'Berth 4.')).content) as Envelope;
    expect(envelope.devices.map((d) => d.device)).toEqual(FIVE);
  });

  // Relays commonly refuse an event over 64 KB. A wrap is the seal, base64 and
  // padded, inside another: a long message to five devices would not fit.
  it('leaves out the least recently seen devices a long message has no room for, and the wrap fits under 64 KB', async () => {
    const one = await aDevice();
    fetchPrekeyBundles.mockResolvedValue(FIVE.map((device) => ({ device, bundle: one.bundle })));
    let largest: { content: string; text: string } | null = null;
    for (let length = 8_000; length <= 16_000; length += 400) {
      const text = 'Manifest line 4. '.repeat(Math.ceil(length / 17)).slice(0, length);
      const sealed = await service.encryptFor('peer-pubkey', text);
      const envelope = JSON.parse(sealed.content) as Envelope;
      const kept = envelope.devices.map((d) => d.device);
      expect(kept.length).toBeGreaterThan(0);
      expect(kept.length).toBeLessThan(FIVE.length);
      expect(kept).toEqual(FIVE.slice(0, kept.length));
      if (kept.length > 1 && (!largest || sealed.content.length > largest.content.length)) largest = { content: sealed.content, text };
    }
    expect(largest).not.toBeNull();
    const envelope = JSON.parse(largest!.content) as Envelope;
    expect(await openAs(envelope, envelope.devices[0], one.secrets)).toBe(largest!.text);

    // Wrapped as a team message is, the longest of them.
    nostrIdentityService.ensureLocalIdentity('a test sender');
    const recipient = getPublicKey(generateSecretKey());
    const rumor = await makeRumor({
      kind: APP_KINDS.CHAT_MESSAGE,
      tags: [['p', recipient], ['m', 'f'.repeat(32)], ['enc', 'ml-kem-768'], ['team', 'wss://team-relay.a-rather-long-hostname.example.org/desk']],
      content: largest!.content,
    });
    const wrap = await wrapRumor(rumor, recipient);
    expect(new TextEncoder().encode(JSON.stringify(wrap)).length).toBeLessThanOrEqual(65_536);
  });

  it('still seals a message too long for any room to the most recently seen device, never to none', async () => {
    const one = await aDevice();
    fetchPrekeyBundles.mockResolvedValue(FIVE.map((device) => ({ device, bundle: one.bundle })));
    const envelope = JSON.parse((await service.encryptFor('peer-pubkey', 'x'.repeat(30_000))).content) as Envelope;
    expect(envelope.devices.map((d) => d.device)).toEqual(['dev-0']);
  });
});
