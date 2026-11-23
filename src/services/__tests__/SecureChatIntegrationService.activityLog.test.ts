/**
 * Phase T3.4 (Teams & Chat operational-reliability roadmap) — verifies
 * SecureChatIntegrationService.sendMessage/processIncomingMessage now
 * write real, persisted ChatActivityLogStore entries (MESSAGE_SENT,
 * MESSAGE_RECEIVED, DECRYPT_FAILED) instead of relying solely on
 * SecureLogger's in-memory-only buffer.
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as the
 * other new SecureChatIntegrationService test files this cycle (channels/
 * messages/endToEnd), for the same reasons documented there.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHANNEL_NOT_SEALED, SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { chatActivityLogStore, ChatActivityAction } from '../ChatActivityLogStore';
import { prekeyBundleStore } from '../crypto/PrekeyBundleStore';
import { ForwardSecrecyService } from '../crypto/ForwardSecrecyService';
import { PQCryptoService } from '../crypto/PQCryptoService';
import { nostrIdentityService } from '../identity/NostrIdentityService';

const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

async function buildRealEnvelopeForSelf(plaintext: string): Promise<string> {
  // Ensured, as the service now does: no identity exists until something needs one.
  const identity = nostrIdentityService.ensureLocalIdentity('a test envelope');
  const forwardSecrecy = new ForwardSecrecyService();
  const { bundle } = await prekeyBundleStore.getOrCreateLocalBundle(identity, forwardSecrecy);
  const pqc = PQCryptoService.getInstance();
  const session = await forwardSecrecy.initiateSession(bundle, undefined);
  const encrypted = await pqc.encryptData(new TextEncoder().encode(plaintext), session.sessionKey);
  return JSON.stringify({
    v: 1,
    ciphertext: toHex(encrypted),
    sessionId: session.sessionId,
    ltCiphertext: toHex(session.ltCiphertext),
    spkCiphertext: toHex(session.spkCiphertext),
    otkCiphertext: undefined,
    otkIndex: undefined
  });
}

describe('SecureChatIntegrationService — real persisted chat activity log (Phase T3.4)', () => {
  const service = SecureChatIntegrationService.getInstance();
  const nostrService = (service as unknown as {
    nostrService: { sendMessage: (channelId: string, content: string, type: string) => Promise<boolean> };
  }).nostrService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a channel message, refused because it cannot be sealed, is logged as nothing sent (legal question E1)', async () => {
    await service.connect();
    const publish = vi.spyOn(nostrService, 'sendMessage').mockResolvedValue(true);
    const channelId = 'chan-activity-sent';

    await expect(service.sendMessage(channelId, 'status check')).rejects.toThrow(CHANNEL_NOT_SEALED);

    // What went out sealed is logged by the sealed paths (sealedDirectMessage.test.ts, teamChat); here nothing went.
    expect(publish).not.toHaveBeenCalled();
    const entries = await chatActivityLogStore.getForChannel(channelId);
    expect(entries.filter((e) => e.action === ChatActivityAction.MESSAGE_SENT)).toEqual([]);
  });

  it('processIncomingMessage writes a real MESSAGE_RECEIVED entry on successful decrypt', async () => {
    const plaintext = 'Team, rendezvous confirmed.';
    const envelope = await buildRealEnvelopeForSelf(plaintext);
    const channelId = 'chan-activity-received';
    const identity = nostrIdentityService.getPubkey();

    const processed = await service.processIncomingMessage({
      content: envelope,
      pqcEncrypted: true,
      senderId: 'pk-sender',
      timestamp: Date.now(),
      channelId
    }, 'nostr');

    expect(processed?.content).toBe(plaintext);

    const entries = await chatActivityLogStore.getForChannel(channelId);
    const receivedEntry = entries.find(e => e.action === ChatActivityAction.MESSAGE_RECEIVED && e.details.messageId === processed?.id);
    expect(receivedEntry).toBeDefined();
    expect(receivedEntry?.userId).toBe(identity);
    expect(receivedEntry?.details.senderId).toBe('pk-sender');
  });

  it('processIncomingMessage writes a real DECRYPT_FAILED entry on decrypt failure, and no MESSAGE_RECEIVED entry for it', async () => {
    const channelId = 'chan-activity-decrypt-failed';
    const identity = nostrIdentityService.getPubkey();
    const bogusEnvelope = {
      v: 1,
      ciphertext: 'aabbccdd',
      sessionId: 'nonexistent-session',
      ltCiphertext: 'a'.repeat(2 * 1088),
      spkCiphertext: 'a'.repeat(2 * 1088),
      otkCiphertext: undefined,
      otkIndex: undefined
    };

    const processed = await service.processIncomingMessage({
      content: JSON.stringify(bogusEnvelope),
      pqcEncrypted: true,
      senderId: 'pk-someone',
      timestamp: Date.now(),
      channelId
    }, 'nostr');

    expect(processed?.metadata?.decryptionFailed).toBe(true);

    const entries = await chatActivityLogStore.getForChannel(channelId);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe(ChatActivityAction.DECRYPT_FAILED);
    expect(entries[0].userId).toBe(identity);
    expect(entries[0].details.senderId).toBe('pk-someone');
  });
});
