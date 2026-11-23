// @vitest-environment node
/**
 * Step 3.2.4 — Forward Secrecy Tests
 *
 * Verifies:
 * 3.2.4.1 — OTK stub removed from IPFSService (no startOTKRotation)
 * 3.2.4.2 — ForwardSecrecyService with ephemeral per-session keys
 * 3.2.4.3 — Prekey bundle structure suitable for Nostr publication
 * 3.2.4.4 — Compromise of long-term key cannot decrypt past sessions
 */
import { describe, it, expect } from 'vitest';

describe('ForwardSecrecyService', () => {
  // ── 3.2.4.1 — OTK stub removed ────────────────────────────────────────────
  it('IPFSService has no startOTKRotation method', async () => {
    // Read the source file to verify the stub is gone (avoids sessionStorage in Node env)
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../services/IPFSService.ts'),
      'utf-8'
    );
    expect(src).not.toContain('startOTKRotation');
    expect(src).not.toContain('setInterval');
  });

  // ── 3.2.4.2 — Ephemeral per-session keys ──────────────────────────────────

  it('initiateSession + acceptSession derive identical session keys', async () => {
    const { ForwardSecrecyService } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();

    // Recipient generates prekey bundle
    const { bundle, secrets } = await fs.generatePrekeyBundle('bob');

    // Initiator creates session using recipient's bundle (with OTK index 0)
    const session = await fs.initiateSession(bundle, 0);
    expect(session.sessionKey.length).toBe(32);
    expect(session.ltCiphertext.length).toBeGreaterThan(0);
    expect(session.spkCiphertext.length).toBeGreaterThan(0);
    expect(session.otkCiphertext).toBeDefined();

    // Recipient accepts with private keys
    const recipientKey = await fs.acceptSession(
      session.sessionId,
      session.ltCiphertext,
      session.spkCiphertext,
      secrets.identityPrivateKey,
      secrets.signedPrekeyPrivateKey,
      session.otkCiphertext,
      secrets.oneTimePrekeyPrivateKeys[0]
    );

    // Both sides must derive the identical 32-byte session key
    expect(recipientKey).toEqual(session.sessionKey);
  });

  it('two separate sessions produce different session keys', async () => {
    const { ForwardSecrecyService } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();

    const { bundle, secrets } = await fs.generatePrekeyBundle('carol');

    const session1 = await fs.initiateSession(bundle, 0);
    const session2 = await fs.initiateSession(bundle, 1);

    // Different sessions → different session keys (forward secrecy)
    expect(session1.sessionKey).not.toEqual(session2.sessionKey);
    expect(session1.sessionId).not.toBe(session2.sessionId);
  });

  it('deriveMessageKey produces unique keys per index', async () => {
    const { ForwardSecrecyService } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();

    const { bundle } = await fs.generatePrekeyBundle('dave');
    const session = await fs.initiateSession(bundle, 0);

    const mk0 = await fs.deriveMessageKey(session.sessionKey, 0);
    const mk1 = await fs.deriveMessageKey(session.sessionKey, 1);
    const mk0b = await fs.deriveMessageKey(session.sessionKey, 0);

    expect(mk0.length).toBe(32);
    expect(mk0).not.toEqual(mk1);
    // Same index → deterministic
    expect(mk0).toEqual(mk0b);
  });

  // ── 3.2.4.3 — Prekey bundle structure ─────────────────────────────────────

  it('prekey bundle contains all required fields for Nostr publication', async () => {
    const { ForwardSecrecyService, OTP_BATCH_SIZE } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();

    const { bundle, secrets } = await fs.generatePrekeyBundle('eve');

    // Bundle shape
    expect(bundle.identity).toBe('eve');
    expect(bundle.identityKey.length).toBe(1184); // ML-KEM-768 public key
    expect(bundle.signedPrekey.length).toBe(1184);
    expect(bundle.signedPrekeySignature.length).toBe(64); // Ed25519 signature
    expect(bundle.signedPrekeyCreatedAt).toBeGreaterThan(0);
    expect(bundle.oneTimePrekeys.length).toBe(OTP_BATCH_SIZE);
    bundle.oneTimePrekeys.forEach(pk => expect(pk.length).toBe(1184));

    // Secrets shape — never published
    expect(secrets.identityPrivateKey.length).toBe(2400);
    expect(secrets.signedPrekeyPrivateKey.length).toBe(2400);
    expect(secrets.oneTimePrekeyPrivateKeys.length).toBe(OTP_BATCH_SIZE);
  });

  it('publishPrekeyBundle export builds correct JSON content shape', async () => {
    const { ForwardSecrecyService } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();
    const { bundle } = await fs.generatePrekeyBundle('frank');

    // Simulate what publishPrekeyBundle does (without hitting nostrService)
    const toHex = (buf: Uint8Array) =>
      Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

    const content = JSON.parse(JSON.stringify({
      identityKey: toHex(bundle.identityKey),
      signedPrekey: toHex(bundle.signedPrekey),
      signedPrekeySignature: toHex(bundle.signedPrekeySignature),
      signedPrekeyCreatedAt: bundle.signedPrekeyCreatedAt,
      oneTimePrekeys: bundle.oneTimePrekeys.map(toHex),
    }));

    expect(content.identityKey).toHaveLength(1184 * 2); // hex
    expect(content.signedPrekey).toHaveLength(1184 * 2);
    expect(content.signedPrekeySignature).toHaveLength(64 * 2);
    expect(content.oneTimePrekeys).toHaveLength(50);
    expect(typeof content.signedPrekeyCreatedAt).toBe('number');
  });

  // ── 3.2.4.4 — Long-term key compromise doesn't decrypt past sessions ──────

  it('compromising long-term key does NOT recover past session key', async () => {
    const { ForwardSecrecyService } = await import('../../services/crypto/ForwardSecrecyService');
    const { PQCryptoService } = await import('../../services/crypto/PQCryptoService');
    const pqc = PQCryptoService.getInstance();
    const fs = new ForwardSecrecyService();

    // Bob generates prekey bundle
    const { bundle, secrets } = await fs.generatePrekeyBundle('bob');

    // Alice initiates session — produces ciphertexts + session key
    const session = await fs.initiateSession(bundle, 0);

    // Simulate attacker who has Bob's long-term private key
    // but NOT the signed prekey private key or OTK private key
    const ss1 = await pqc.kemDecapsulate(session.ltCiphertext, secrets.identityPrivateKey);

    // Attacker can recover ss1, but session key = HKDF(ss1 || ss2 [|| ss3])
    // Without ss2 (from signed prekey) and ss3 (from OTK), the derived key differs
    const { subtle } = crypto;
    const ikmKey = await subtle.importKey('raw', ss1, 'HKDF', false, ['deriveBits']);
    const attackerDerived = new Uint8Array(
      await subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(`starcom-fs-session-${session.sessionId}`) },
        ikmKey,
        256
      )
    );

    // Attacker's derived key MUST NOT match the real session key
    expect(attackerDerived).not.toEqual(session.sessionKey);
  });

  it('needsPrekeyRotation flags expired prekeys', async () => {
    const { ForwardSecrecyService, SIGNED_PREKEY_LIFETIME_MS } = await import('../../services/crypto/ForwardSecrecyService');
    const fs = new ForwardSecrecyService();

    expect(fs.needsPrekeyRotation(Date.now())).toBe(false);
    expect(fs.needsPrekeyRotation(Date.now() - SIGNED_PREKEY_LIFETIME_MS - 1)).toBe(true);
  });
});
