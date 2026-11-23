/**
 * A message is marked encrypted only when an encrypted envelope exists (plan
 * item 0.2).
 *
 * sendMessage fell back to plain text whenever the recipient's prekey bundle
 * could not be found, and said nothing about it in its result, so the adapter
 * above it stamped every message `encrypted: true` and the direct-message
 * window showed a lock beside text that had crossed the relays in the clear
 * (scripts/check-chat.mjs, 2026-09-26). The result now carries what actually
 * happened, and received messages carry it too.
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as the other
 * SecureChatIntegrationService suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));

const { fetchPrekeyBundles } = vi.hoisted(() => ({ fetchPrekeyBundles: vi.fn() }));
vi.mock('../crypto/PQCKeyPublisher', () => ({
  fetchPrekeyBundles,
  publishPrekeyBundle: vi.fn(async () => undefined),
}));

import { CHANNEL_NOT_SEALED, SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { prekeyBundleStore } from '../crypto/PrekeyBundleStore';
import { ForwardSecrecyService } from '../crypto/ForwardSecrecyService';
import { nostrIdentityService } from '../identity/NostrIdentityService';

describe('SecureChatIntegrationService — what is marked encrypted', () => {
  const service = SecureChatIntegrationService.getInstance();
  const nostrService = (service as unknown as {
    nostrService: {
      sendMessage: (channelId: string, content: string, type: string) => Promise<boolean>;
      getChannelMessages: (channelId: string) => unknown[];
    };
  }).nostrService;

  afterEach(() => {
    vi.restoreAllMocks();
    fetchPrekeyBundles.mockReset();
  });

  it('sends nothing to a channel: it would go to public relays in plain text (legal question E1)', async () => {
    await service.connect();
    const published: string[] = [];
    vi.spyOn(nostrService, 'sendMessage').mockImplementation(async (_channel, content) => { published.push(content); return true; });
    fetchPrekeyBundles.mockResolvedValue([]);

    // A direct message is sealed to its recipient (plan item 2.7; sealedDirectMessage.test.ts), a team's to each
    // member; anything else used to go out as a plain channel message, labelled not encrypted.
    await expect(service.sendMessage('c'.repeat(64), 'Two of the five sites look closed.')).rejects.toThrow(CHANNEL_NOT_SEALED);
    expect(published).toEqual([]);
  });

  it('reports a received plain-text message as not encrypted', async () => {
    const channelId = 'test-channel-flag-plain';
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([{
      id: 'evt_plain', teamId: '', channelId, senderId: 'pk-sender', senderDID: 'did:nostr:pk-sender',
      senderAgency: '', content: 'plain words', messageType: 'text', timestamp: Date.now(), encrypted: false, pqcEncrypted: false,
    }]);

    const [message] = await service.getMessages(channelId);

    expect(message.encrypted).toBe(false);
  });
});
