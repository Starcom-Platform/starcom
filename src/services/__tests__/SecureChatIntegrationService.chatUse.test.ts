/**
 * Chat announces a key's prekeys only once the person has used chat with it (decision D-MF, MF15).
 *
 * A first mission report made a key, and chat published that key's prekey bundle to five public relays at
 * once, unasked: a relay could see the new key's chat material arrive beside its first sealed message. Now a
 * key made for anything else is prepared for reading and announces nothing, until the person sends, or opens a
 * conversation or makes a channel; then its bundle is announced, once.
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as the other SecureChatIntegrationService suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));

const { fetchPrekeyBundles, publishPrekeyBundle } = vi.hoisted(() => ({ fetchPrekeyBundles: vi.fn(), publishPrekeyBundle: vi.fn() }));
vi.mock('../crypto/PQCKeyPublisher', () => ({ fetchPrekeyBundles, publishPrekeyBundle }));

import { SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import nostrService from '../nostrService';
import { chatUsedBy, forgetChatUse } from '../chat/chatUse';

const service = SecureChatIntegrationService.getInstance();
const open = () => service.processIncomingMessage({ content: '{}', pqcEncrypted: true, senderId: 'pk-sender', timestamp: Date.now() }, 'direct');

beforeEach(() => {
  forgetChatUse();
  publishPrekeyBundle.mockReset();
  publishPrekeyBundle.mockResolvedValue(null);
});

describe('a key made for something other than chat', () => {
  it('is prepared for reading what arrives, and announces nothing', async () => {
    const key = nostrIdentityService.ensureLocalIdentity('reporting back on a mission');
    await service.initialize();
    await open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chatUsedBy(key)).toBe(false);
    expect(publishPrekeyBundle).not.toHaveBeenCalled();
  });

  it('announces its prepared bundle once the person uses chat, and only once', async () => {
    const key = nostrIdentityService.ensureLocalIdentity('reporting back on a mission');
    await open();
    expect(publishPrekeyBundle).not.toHaveBeenCalled();

    service.markChatUsed();
    await vi.waitFor(() => expect(publishPrekeyBundle).toHaveBeenCalledTimes(1));
    expect(publishPrekeyBundle.mock.calls[0][0]).toMatchObject({ identity: key });
    expect(chatUsedBy(key)).toBe(true);

    service.markChatUsed();
    await open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(publishPrekeyBundle).toHaveBeenCalledTimes(1);
  });

  it('does not count the service making a channel as using chat: the adapter makes its Global channel at every mount', async () => {
    const key = nostrIdentityService.ensureLocalIdentity('a test');
    await service.createChannel('Global', 'global', []);
    expect(chatUsedBy(key)).toBe(false);
    expect(publishPrekeyBundle).not.toHaveBeenCalled();
  });
});

describe('a key locked with a passphrase (D-KL)', () => {
  it('announces nothing while it is locked, and its bundle once the person unlocks it', async () => {
    const passphrase = 'correct horse battery staple';
    nostrIdentityService.ensureLocalIdentity('a test');
    await nostrService.lock(passphrase, 4);
    // The next visit: locked in storage, not open in memory.
    (nostrService as unknown as { secretKey: Uint8Array | null }).secretKey = null;
    try {
      await service.initialize();
      service.markChatUsed();
      await open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(publishPrekeyBundle).not.toHaveBeenCalled();

      await nostrService.unlock(passphrase);
      await vi.waitFor(() => expect(publishPrekeyBundle).toHaveBeenCalledTimes(1));
    } finally {
      nostrService.forgetIdentity();
    }
  });
});
