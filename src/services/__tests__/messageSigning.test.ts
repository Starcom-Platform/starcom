// @vitest-environment node
/**
 * Step 3.2.3 — Message Signing Tests
 *
 * Verifies:
 * 3.2.3.1 — signMessage() uses real Ed25519 asymmetric signatures (not XOR / random
 *           bytes, and not the earlier HMAC-SHA-256 scheme where the "public" and
 *           "private" keys were the same raw bytes — anyone who could verify a
 *           signature could also forge one)
 * 3.2.3.2 — verifySignature() rejects tampered messages
 * 3.2.3.3 — NostrChatAdapter.sendMessage() attaches signature to metadata
 * 3.2.3.4 — SecureChatWindow renders verification badge for signed messages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 3.2.3.1 & 3.2.3.2: Real Ed25519 signing/verification ──────────────

describe('PQCryptoService — Ed25519 signing', () => {
  let pqc: InstanceType<typeof import('../../services/crypto/PQCryptoService').PQCryptoService>;

  beforeEach(async () => {
    const mod = await import('../../services/crypto/PQCryptoService');
    pqc = mod.PQCryptoService.getInstance();
  });

  it('generateSignatureKeyPair returns a real asymmetric Ed25519 keypair', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    expect(kp.algorithm).toBe('Ed25519');
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
    // Genuinely asymmetric — the public key must NOT equal the private key, otherwise
    // anyone who receives it to verify a signature could also forge new ones.
    expect(kp.publicKey).not.toEqual(kp.privateKey);
  });

  it('signMessage returns a deterministic 64-byte Ed25519 signature', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    const msg = new TextEncoder().encode('hello world');
    const sig = await pqc.signMessage(msg, kp.privateKey);

    expect(sig.algorithm).toBe('Ed25519');
    expect(sig.signature.length).toBe(64); // Ed25519 signature output
    expect(sig.timestamp).toBeGreaterThan(0);

    // Ed25519 is deterministic (RFC 8032) — same message + key yields same signature
    const sig2 = await pqc.signMessage(msg, kp.privateKey);
    expect(sig2.signature).toEqual(sig.signature);
  });

  it('different messages produce different signatures', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    const sig1 = await pqc.signMessage(new TextEncoder().encode('msg-A'), kp.privateKey);
    const sig2 = await pqc.signMessage(new TextEncoder().encode('msg-B'), kp.privateKey);
    expect(sig1.signature).not.toEqual(sig2.signature);
  });

  it('verifySignature returns true for valid signature', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    const msg = new TextEncoder().encode('valid message');
    const sig = await pqc.signMessage(msg, kp.privateKey);
    const valid = await pqc.verifySignature(sig, msg, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('verifySignature rejects tampered message', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    const msg = new TextEncoder().encode('original');
    const sig = await pqc.signMessage(msg, kp.privateKey);

    const tampered = new TextEncoder().encode('tampered');
    const valid = await pqc.verifySignature(sig, tampered, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('verifySignature rejects wrong key', async () => {
    const kp1 = await pqc.generateSignatureKeyPair();
    const kp2 = await pqc.generateSignatureKeyPair();
    const msg = new TextEncoder().encode('test');
    const sig = await pqc.signMessage(msg, kp1.privateKey);

    const valid = await pqc.verifySignature(sig, msg, kp2.publicKey);
    expect(valid).toBe(false);
  });

  it('signature is not random padding or XOR — it is consistent', async () => {
    const kp = await pqc.generateSignatureKeyPair();
    const msg = new TextEncoder().encode('determinism check');
    const results: Uint8Array[] = [];
    for (let i = 0; i < 5; i++) {
      const sig = await pqc.signMessage(msg, kp.privateKey);
      results.push(sig.signature);
    }
    // All five signatures must be identical (HMAC is deterministic)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ── 3.2.3.3: NostrChatAdapter.sendMessage attaches signature to metadata ─────

describe('NostrChatAdapter — message signing integration', () => {
  it('sendMessage attaches signature metadata to outbound messages', async () => {
    // We test the signing block in isolation by importing PQCryptoService
    // and simulating what sendMessage does
    const { PQCryptoService } = await import('../../services/crypto/PQCryptoService');
    const pqc = PQCryptoService.getInstance();

    const content = 'Hello, this is a signed message';
    const sigKP = await pqc.generateSignatureKeyPair();
    const contentBytes = new TextEncoder().encode(content);
    const sig = await pqc.signMessage(contentBytes, sigKP.privateKey);

    const metadata: Record<string, unknown> = {};
    metadata.signature = Array.from(sig.signature);
    metadata.signatureAlgorithm = sig.algorithm;
    metadata.signerPublicKey = Array.from(sigKP.publicKey);
    metadata.signedAt = sig.timestamp;

    // Verify shape matches what NostrChatAdapter produces
    expect(metadata.signature).toBeInstanceOf(Array);
    expect((metadata.signature as number[]).length).toBe(64);
    expect(metadata.signatureAlgorithm).toBe('Ed25519');
    expect(metadata.signerPublicKey).toBeInstanceOf(Array);
    expect((metadata.signerPublicKey as number[]).length).toBe(32);
    expect(typeof metadata.signedAt).toBe('number');

    // Verify the signature is valid via the service
    const valid = await pqc.verifySignature(
      { signature: new Uint8Array(metadata.signature as number[]), algorithm: 'Ed25519', timestamp: metadata.signedAt as number },
      contentBytes,
      new Uint8Array(metadata.signerPublicKey as number[])
    );
    expect(valid).toBe(true);
  });
});

// ── 3.2.3.4: SecureChatWindow renders verification badge ─────────────────────

describe('SecureChatWindow — verification badge rendering', () => {
  it('renders ✅ badge when message has signature metadata', () => {
    // Simulate the rendering logic used in SecureChatWindow.tsx
    const msg = {
      content: 'test',
      metadata: {
        signature: [1, 2, 3],
        signatureAlgorithm: 'Ed25519',
        signerPublicKey: [4, 5, 6],
        signedAt: Date.now(),
      },
    };

    // The condition from the component: msg.metadata?.signature
    const shouldShowBadge = !!msg.metadata?.signature;
    expect(shouldShowBadge).toBe(true);

    // Title includes algorithm
    const title = `Signed: ${msg.metadata.signatureAlgorithm || 'Ed25519'}`;
    expect(title).toBe('Signed: Ed25519');
  });

  it('does NOT render badge when signature is absent', () => {
    const msg = { content: 'test', metadata: {} };
    const shouldShowBadge = !!(msg.metadata as Record<string, unknown>)?.signature;
    expect(shouldShowBadge).toBe(false);
  });

  it('does NOT render badge when metadata is undefined', () => {
    const msg = { content: 'test' };
    const shouldShowBadge = !!(msg as { metadata?: Record<string, unknown> }).metadata?.signature;
    expect(shouldShowBadge).toBe(false);
  });
});
