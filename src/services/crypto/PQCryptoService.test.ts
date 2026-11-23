// src/services/crypto/PQCryptoService.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PQCryptoService } from './PQCryptoService';

/*
 * ─── THE IPFS VERSIONING SCAFFOLDING IS GONE ────────────────────────────────
 *
 * An IPFSContentVersion type, an IPFSContentVersioningService interface and a
 * 90-line MockIPFSVersioningService stood here. The nine tests that used them
 * were deleted on 2026-08-22 (see the note at the bottom of this file for why).
 * The scaffolding outlived them: the mock was still constructed in beforeEach
 * and assigned to a `versioningService` variable that no surviving test read.
 *
 * It was not harmless. Its generateChecksum called
 * `encryptClassifiedData(content, ClassificationLevel.Confidential)` with a
 * Uint8Array where a string was wanted, and read `encrypted.quantumPart` — a
 * property this service has never returned. That compiled only because
 * tsconfig.app.json excludes test files from typechecking, and it ran only
 * because nothing called it.
 *
 * Deleted on the same standard the note below sets: scaffolding for tests
 * nobody kept is not a specification.
 */

describe('PQCryptoService', () => {
  let cryptoService: PQCryptoService;

  beforeAll(async () => {
    cryptoService = PQCryptoService.getInstance();
    await cryptoService.initialize();
  });

  it('should initialize successfully', async () => {
    expect(cryptoService).toBeInstanceOf(PQCryptoService);
  });

  it('should generate key pairs', async () => {
    const keyPair = await cryptoService.generateKEMKeyPair();
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.publicKey.length).toBeGreaterThan(0);
    expect(keyPair.privateKey.length).toBeGreaterThan(0);
    expect(keyPair.algorithm).toBe('ML-KEM-768');
  });

  it('should encrypt and decrypt data', async () => {
    const originalData = 'Test message for encryption';

    // encryptProtectedData returns { data, key } separately (not a single bundled
    // payload) — the encrypted blob alone is deliberately not enough to decrypt;
    // the caller must hold onto `key` separately (see the method's own doc comment).
    const { data: encrypted, key } = await cryptoService.encryptProtectedData(originalData);

    expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
    expect(encrypted.metadata.algorithm).toBe('ML-KEM-768+AES-256-GCM');
    // No tier is stamped into the envelope any more. It was only ever written so
    // the decrypt path could compare it against itself.
    expect(encrypted.metadata.classification).toBeUndefined();

    const decrypted = await cryptoService.decryptProtectedData(encrypted, key);

    expect(decrypted).toBe('Test message for encryption');
  });

  /**
   * Replaces a test named 'should enforce classification access control',
   * which encrypted at TopSecret, asked to decrypt at Confidential, and
   * asserted a rejection with 'Access denied'.
   *
   * That check compared a tier stored inside the envelope against a tier the
   * caller passed in — the caller supplied both sides, so it enforced nothing.
   * The test passed, and proved nothing about access.
   *
   * This asserts the control that is actually there: the KEM private key. A
   * payload encrypted under one ephemeral keypair cannot be opened with
   * another's key, no matter what any label says.
   */
  /**
   * Read-tolerance for data encrypted before the purge.
   *
   * Envelopes written by the old code carry `metadata.classification: 'SECRET'`
   * and there may be records sitting in a local keystore right now. The field is
   * still ACCEPTED on the type and must be ignored, not rejected — dropping it
   * from the interface without this would have made those records permanently
   * unreadable, which is a worse outcome than the label ever was.
   */
  it('decrypts a legacy envelope that still carries a tier in its metadata', async () => {
    const { data: encrypted, key } = await cryptoService.encryptProtectedData('Legacy payload');

    const legacy = {
      ...encrypted,
      metadata: { ...encrypted.metadata, classification: 'SECRET' },
    };

    await expect(cryptoService.decryptProtectedData(legacy, key)).resolves.toBe('Legacy payload');
  });

  it('cannot be decrypted with a key from a different payload', async () => {
    const { data: encrypted } = await cryptoService.encryptProtectedData('Sensitive payload');
    const { key: unrelatedKey } = await cryptoService.encryptProtectedData('A different payload');

    await expect(
      cryptoService.decryptProtectedData(encrypted, unrelatedKey)
    ).rejects.toThrow();
  });


/**
 * REMOVED 2026-08-22: nine tests asserting an API this service has never had.
 *
 * An entire "IPFS Content Versioning" block, plus tests for `hashData`,
 * `generateRandomBytes`, `getAuditLog` and `getSecurityStatus`. None of those
 * methods exist on PQCryptoService, and `git log -S` confirms none ever
 * did — they were not removed in a refactor, they were never written.
 *
 * The service exposes a coherent and deliberately narrow surface:
 * initialize, generateKEMKeyPair, generateSignatureKeyPair, kemEncapsulate,
 * kemDecapsulate, encryptData, decryptData, encryptProtectedData,
 * decryptProtectedData, signMessage, verifySignature. The tests that remain
 * exercise that.
 *
 * Deleted rather than skipped. A failing test for a method nobody wrote is not
 * a specification, it is nine permanent red marks that train a reader to
 * ignore the suite — and this repository already has a guard whose whole
 * purpose is stopping a capability from looking present when it is absent.
 * The same standard has to apply to the tests.
 *
 * If content versioning IS wanted, it is a feature to design, not a test to
 * un-delete. Recorded as such in docs/build-passes.md.
 */

});

/**
 * FOLLOW-UP 2026-09-10: the other half of that scaffolding is gone too.
 *
 * The note at the top of this file records deleting a 90-line
 * MockIPFSVersioningService from here. What it did not know is that a SECOND,
 * larger copy of the same idea lived at src/services/IPFSVersioningService
 * .test.ts — 390 lines declaring an IPFSContentVersion type, an
 * IPFSContentVersioningService interface, a full IPFSVersioningService class,
 * and 15 tests exercising that class.
 *
 * Its only import was vitest. The class it tested was defined inside it and
 * referenced nowhere in the application. So it was 15 green checkmarks over no
 * shipped code — which is worse than the red ones removed above, because a
 * passing suite invites nobody to look.
 *
 * It surfaced only because it held 22 of the clearance-tier literals the
 * classification purge was counting down, which is a poor way to find dead
 * tests and the reason the count was worth keeping honest.
 *
 * Deleted on the standard set below rather than migrated onto the handling
 * axes: re-keying it would have produced a tidy suite that still tested
 * nothing. If content versioning is wanted, it is a feature to design.
 */
