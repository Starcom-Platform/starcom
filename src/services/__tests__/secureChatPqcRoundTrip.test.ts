/**
 * Cycle B1 — the crypto property this whole cycle exists to fix.
 *
 * Before this cycle, SecureChatIntegrationService.sendMessage() generated a
 * fresh throwaway ML-KEM keypair per call and fed the KEM PUBLIC key
 * directly into encryptData() (which expects a raw 32-byte AES key, not a
 * ~1184-byte KEM public key) — not an encapsulate step at all. The private
 * key was discarded immediately. processIncomingMessage() then generated a
 * SECOND, completely unrelated keypair to attempt decryption — mathematically
 * guaranteed to fail, silently caught.
 *
 * This test reproduces the exact sequence sendMessage()/processIncomingMessage()
 * now perform (recipient's published bundle -> initiateSession -> encrypt with
 * the derived session key -> acceptSession -> decrypt) without needing to mock
 * the rest of the singleton service's unrelated Nostr/IPFS machinery — it proves
 * the real cryptographic property (both sides derive the identical session key,
 * and the plaintext survives the round trip), not just "no error was thrown."
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { ForwardSecrecyService } from '../crypto/ForwardSecrecyService';
import { PQCryptoService } from '../crypto/PQCryptoService';

describe('SecureChat PQC round trip (Cycle B1 fix)', () => {
  it('a message encrypted for a real recipient bundle decrypts back to the original plaintext', async () => {
    const forwardSecrecy = new ForwardSecrecyService();
    const pqc = PQCryptoService.getInstance();

    // Bob generates and "publishes" his bundle (public halves would go to
    // Nostr via publishPrekeyBundle; secrets stay local, as
    // PrekeyBundleStore now persists them).
    const { bundle: bobBundle, secrets: bobSecrets } = await forwardSecrecy.generatePrekeyBundle('bob-pubkey');

    // --- sendMessage()'s new PQC block, exactly ---
    const otkIndex = Math.floor(Math.random() * bobBundle.oneTimePrekeys.length);
    const session = await forwardSecrecy.initiateSession(bobBundle, otkIndex);
    const plaintext = 'Meeting confirmed — 0300Z, at the usual place.';
    const contentBytes = new TextEncoder().encode(plaintext);
    const encrypted = await pqc.encryptData(contentBytes, session.sessionKey);

    // --- processIncomingMessage()'s new PQC block, exactly ---
    const recoveredSessionKey = await forwardSecrecy.acceptSession(
      session.sessionId,
      session.ltCiphertext,
      session.spkCiphertext,
      bobSecrets.identityPrivateKey,
      bobSecrets.signedPrekeyPrivateKey,
      session.otkCiphertext,
      bobSecrets.oneTimePrekeyPrivateKeys[otkIndex]
    );

    // The real cryptographic property: both sides derived the SAME session
    // key via independent KEM decapsulation, not a coincidence of mocking.
    expect(recoveredSessionKey).toEqual(session.sessionKey);

    const decrypted = await pqc.decryptData(encrypted, recoveredSessionKey);
    const recoveredPlaintext = new TextDecoder().decode(decrypted);

    expect(recoveredPlaintext).toBe(plaintext);
  });

  it('a THIRD PARTY\'s unrelated session key cannot decrypt — this is what the pre-fix code accidentally did to the real recipient too (a fresh, unrelated keypair generated purely to attempt decryption)', async () => {
    const forwardSecrecy = new ForwardSecrecyService();
    const pqc = PQCryptoService.getInstance();

    const { bundle: bobBundle } = await forwardSecrecy.generatePrekeyBundle('bob-pubkey');
    const session = await forwardSecrecy.initiateSession(bobBundle, 0);
    const encrypted = await pqc.encryptData(new TextEncoder().encode('secret'), session.sessionKey);

    // Eve derives her OWN unrelated session against the same bundle (a
    // different, real 32-byte AES key — not a size mismatch, a genuinely
    // wrong key) and tries to decrypt Bob's message with it.
    const eveSession = await forwardSecrecy.initiateSession(bobBundle, 1);
    await expect(pqc.decryptData(encrypted, eveSession.sessionKey)).rejects.toThrow();
  });

  it('two different messages to the same recipient use independent sessions — a compromised session key does not expose other messages', async () => {
    const forwardSecrecy = new ForwardSecrecyService();
    const { bundle: bobBundle } = await forwardSecrecy.generatePrekeyBundle('bob-pubkey');

    const session1 = await forwardSecrecy.initiateSession(bobBundle, 0);
    const session2 = await forwardSecrecy.initiateSession(bobBundle, 1);

    expect(session1.sessionKey).not.toEqual(session2.sessionKey);
  });
});
