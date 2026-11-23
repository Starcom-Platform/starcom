/**
 * SecureChatIntegrationService — Cycle B1 hardening pass.
 *
 * No test file existed for this service at all, despite it being where the
 * real X3DH round trip lives. This covers a real, reachable failure mode:
 * a genuinely undecryptable PQC envelope (e.g. a reused/exhausted one-time
 * prekey causing a session-key mismatch between sender and recipient)
 * previously left `content` as the raw envelope JSON — hex ciphertext,
 * session ids, key material — displayed verbatim as if it were the
 * message. Now replaced with an honest placeholder, with the failure
 * surfaced in metadata rather than silently swallowed.
 *
 * Stays on this project's default jsdom environment rather than Node —
 * SecureChatIntegrationService transitively imports IPFSService/
 * featureFlags.ts, which hit a module-evaluation-order error specifically
 * under the Node test environment (unrelated to this fix; a pre-existing
 * ordering quirk in how those modules load there). jsdom has no
 * crypto.subtle, which the real decrypt path here needs — polyfilled
 * locally, only in this file, from Node's real webcrypto, same technique
 * used elsewhere this session.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect } from 'vitest';
import { SecureChatIntegrationService } from '../SecureChatIntegrationService';

describe('SecureChatIntegrationService.processIncomingMessage — decrypt failure handling', () => {
  it('replaces content with an honest placeholder, not the raw envelope, when PQC decryption fails', async () => {
    const service = SecureChatIntegrationService.getInstance();

    // A well-formed-looking but genuinely undecryptable envelope — the
    // sessionId/ciphertexts don't correspond to any real session this
    // instance has state for, so acceptSession will derive a session key
    // that doesn't match, and decryptData will fail.
    const bogusEnvelope = {
      v: 1,
      ciphertext: 'aabbccdd',
      sessionId: 'nonexistent-session',
      ltCiphertext: 'a'.repeat(2 * 1088), // ML-KEM-768 ciphertext is 1088 bytes
      spkCiphertext: 'a'.repeat(2 * 1088),
      otkCiphertext: undefined,
      otkIndex: undefined
    };

    const rawMessage = {
      content: JSON.stringify(bogusEnvelope),
      pqcEncrypted: true,
      senderId: 'pk-someone',
      senderName: 'Someone',
      timestamp: Date.now()
    };

    const result = await service.processIncomingMessage(rawMessage, 'nostr');

    expect(result).not.toBeNull();
    expect(result!.content).toBe('This message could not be decrypted.');
    expect(result!.content).not.toContain('ciphertext');
    expect(result!.content).not.toContain('nonexistent-session');
    expect(result!.metadata?.decryptionFailed).toBe(true);
  });

  it('does not set decryptionFailed for a genuinely unencrypted message', async () => {
    const service = SecureChatIntegrationService.getInstance();

    const result = await service.processIncomingMessage({
      content: 'plain text message',
      pqcEncrypted: false,
      senderId: 'pk-someone',
      senderName: 'Someone',
      timestamp: Date.now()
    }, 'nostr');

    expect(result?.content).toBe('plain text message');
    expect(result?.metadata?.decryptionFailed).toBe(false);
  });
});
