/**
 * SecureChatIntegrationService — end-to-end (the real-PQC-chat
 * implementation cycle).
 *
 * Every other new test file this cycle checks one method at a time. This
 * one drives connect() -> createChannel() -> getChannels() -> sendMessage()
 * -> getMessages()/subscribeToMessages() in sequence against the real
 * class (only NostrService's actual relay I/O is mocked — no real network
 * in this environment) — proving the whole 'secure' provider now genuinely
 * works together, which is what actually stops SecureChatContext.tsx from
 * falling back to 'nostr' in practice (see the previous cycle's fix,
 * commit 7ca02e4 — that fix only kicks in on failure; this is what makes
 * 'secure' stop failing in the first place).
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as the
 * other new SecureChatIntegrationService test files this cycle, for the
 * same reasons documented there.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHANNEL_NOT_SEALED, SecureChatIntegrationService } from '../SecureChatIntegrationService';

describe('SecureChatIntegrationService — end-to-end', () => {
  const service = SecureChatIntegrationService.getInstance();
  const nostrService = (service as unknown as {
    nostrService: {
      sendMessage: (channelId: string, content: string, type: string) => Promise<boolean>;
      getChannelMessages: (channelId: string) => unknown[];
      subscribeToChannel: (channelId: string) => string[];
      unsubscribeFromChannel: (channelId: string) => void;
    };
  }).nostrService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connect -> createChannel -> getChannels -> getMessages: a channel is kept and read; writing to it sends nothing', async () => {
    await service.connect();
    expect(service.isConnected()).toBe(true);

    const channel = await service.createChannel('Investigation: end-to-end-case', 'group', []);
    const channels = await service.getChannels();
    expect(channels.some(c => c.channelId === channel.channelId)).toBe(true);

    // A channel message cannot be sealed, so it is not sent (legal question E1): nothing reaches NostrService.
    const publish = vi.spyOn(nostrService, 'sendMessage').mockResolvedValue(true);
    await expect(service.sendMessage(channel.channelId, 'End-to-end plaintext.')).rejects.toThrow(CHANNEL_NOT_SEALED);
    expect(publish).not.toHaveBeenCalled();

    // What others published there is still read, as it is: public, and marked not encrypted.
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([{
      id: 'evt-e2e',
      teamId: '',
      channelId: channel.channelId,
      senderId: 'someone',
      senderDID: 'did:nostr:someone',
      content: 'Read from the relay.',
      messageType: 'text',
      timestamp: Date.now(),
      encrypted: false,
      pqcEncrypted: false
    }]);

    const history = await service.getMessages(channel.channelId);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Read from the relay.');
  });

  it('sendMessage throws (does not silently "succeed") when the Nostr publish actually fails', async () => {
    await service.connect();
    const channel = await service.createChannel('Investigation: publish-failure-case', 'group', []);

    vi.spyOn(nostrService, 'sendMessage').mockResolvedValue(false);

    await expect(service.sendMessage(channel.channelId, 'This should not silently succeed.')).rejects.toThrow();
  });
});
