/**
 * ForwardSecrecyService — Ephemeral per-session key derivation
 *
 * Implements X3DH-like key agreement adapted for post-quantum ML-KEM:
 *  1. Initiator generates ephemeral ML-KEM keypair
 *  2. Initiator encapsulates with recipient's long-term + signed prekey
 *  3. Both shared secrets fed into HKDF → session key
 *  4. Ephemeral keys deleted after derivation
 *
 * Prekey bundles published to Nostr (Kind 30078 / NIP-78).
 */

import { createLogger } from '@utils/logger';
import { PQCryptoService } from './PQCryptoService';

const log = createLogger({ prefix: 'ForwardSecrecy' });

/** Number of one-time prekeys to generate per bundle */
const OTP_BATCH_SIZE = 50;

/** Signed prekey rotation interval (30 days) */
const SIGNED_PREKEY_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface PrekeyBundle {
  /** Owner's identity (hex pubkey or DID) */
  identity: string;
  /** Long-term ML-KEM public key */
  identityKey: Uint8Array;
  /** Signed prekey — rotates monthly */
  signedPrekey: Uint8Array;
  /** Timestamp when signed prekey was created */
  signedPrekeyCreatedAt: number;
  /** HMAC signature over the signed prekey */
  signedPrekeySignature: Uint8Array;
  /** One-time prekeys (consumed on first contact) */
  oneTimePrekeys: Uint8Array[];
}

export interface SessionKeys {
  /** Unique session identifier */
  sessionId: string;
  /** Derived 32-byte session key (AES-256-GCM) */
  sessionKey: Uint8Array;
  /** Timestamp of derivation */
  createdAt: number;
  /** KEM ciphertext for long-term key (sent to peer) */
  ltCiphertext: Uint8Array;
  /** KEM ciphertext for signed prekey (sent to peer) */
  spkCiphertext: Uint8Array;
  /** KEM ciphertext for one-time prekey (sent to peer, if available) */
  otkCiphertext?: Uint8Array;
}

/**
 * Derive a session key using HKDF-SHA-256.
 * Combines multiple shared secrets via concatenation → HKDF extract + expand.
 */
async function hkdfDerive(
  sharedSecrets: Uint8Array[],
  info: string,
  salt?: Uint8Array
): Promise<Uint8Array> {
  // Concatenate all shared secrets
  const totalLen = sharedSecrets.reduce((s, a) => s + a.length, 0);
  const ikm = new Uint8Array(totalLen);
  let offset = 0;
  for (const ss of sharedSecrets) {
    ikm.set(ss, offset);
    offset += ss.length;
  }

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt ?? new Uint8Array(32),
      info: new TextEncoder().encode(info),
    },
    ikmKey,
    256
  );
  return new Uint8Array(derived);
}

export class ForwardSecrecyService {
  private pqc: PQCryptoService;
  /** Signing key for prekey authentication (HMAC) */
  private signingKey: Uint8Array | null = null;

  constructor(pqcService?: PQCryptoService) {
    this.pqc = pqcService ?? PQCryptoService.getInstance();
  }

  /**
   * Generate a full prekey bundle for the local user.
   * Call this on first launch or when one-time prekeys are exhausted.
   */
  async generatePrekeyBundle(identity: string): Promise<{
    bundle: PrekeyBundle;
    /** Private keys — NEVER publish; caller must persist securely */
    secrets: {
      identityPrivateKey: Uint8Array;
      signedPrekeyPrivateKey: Uint8Array;
      oneTimePrekeyPrivateKeys: Uint8Array[];
    };
  }> {
    // Long-term ML-KEM keypair
    const ltKP = await this.pqc.generateKEMKeyPair();

    // Signed prekey
    const spKP = await this.pqc.generateKEMKeyPair();
    const sigKP = await this.pqc.generateSignatureKeyPair();
    this.signingKey = sigKP.privateKey;
    const spSig = await this.pqc.signMessage(spKP.publicKey, sigKP.privateKey);

    // One-time prekeys
    const { publicKeys: otkPublicKeys, privateKeys: otkPrivateKeys } = await this.generateOneTimePrekeys(OTP_BATCH_SIZE);

    const bundle: PrekeyBundle = {
      identity,
      identityKey: ltKP.publicKey,
      signedPrekey: spKP.publicKey,
      signedPrekeyCreatedAt: Date.now(),
      signedPrekeySignature: spSig.signature,
      oneTimePrekeys: otkPublicKeys,
    };

    log.debug(`Generated prekey bundle: ${otkPublicKeys.length} one-time prekeys`);

    return {
      bundle,
      secrets: {
        identityPrivateKey: ltKP.privateKey,
        signedPrekeyPrivateKey: spKP.privateKey,
        oneTimePrekeyPrivateKeys: otkPrivateKeys,
      },
    };
  }

  /**
   * Generate `count` fresh one-time prekey keypairs — the same primitive
   * generatePrekeyBundle() uses for its initial batch, extracted so
   * PrekeyBundleStore can also call it to replace individually-consumed
   * OTKs (P3.3 Part A: shrinking the OTK-collision race window by
   * periodically refreshing consumed slots) without duplicating the
   * generation loop.
   */
  async generateOneTimePrekeys(count: number): Promise<{ publicKeys: Uint8Array[]; privateKeys: Uint8Array[] }> {
    const publicKeys: Uint8Array[] = [];
    const privateKeys: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const kp = await this.pqc.generateKEMKeyPair();
      publicKeys.push(kp.publicKey);
      privateKeys.push(kp.privateKey);
    }
    return { publicKeys, privateKeys };
  }

  /**
   * Initiate a session with a remote user given their prekey bundle.
   *
   * Steps:
   *  1. Encapsulate with recipient's long-term key → ss1
   *  2. Encapsulate with recipient's signed prekey → ss2
   *  3. (Optional) Encapsulate with a one-time prekey → ss3
   *  4. HKDF(ss1 || ss2 [|| ss3]) → session key
   *  5. Ephemeral key material zeroed
   */
  async initiateSession(
    recipientBundle: PrekeyBundle,
    oneTimePrekeyIndex?: number
  ): Promise<SessionKeys> {
    // 1. Encapsulate with long-term identity key
    const lt = await this.pqc.kemEncapsulate(recipientBundle.identityKey);

    // 2. Encapsulate with signed prekey
    const spk = await this.pqc.kemEncapsulate(recipientBundle.signedPrekey);

    // 3. Optionally encapsulate with one-time prekey
    let otkResult: { ciphertext: Uint8Array; sharedSecret: Uint8Array } | null = null;
    if (
      oneTimePrekeyIndex !== undefined &&
      oneTimePrekeyIndex < recipientBundle.oneTimePrekeys.length
    ) {
      otkResult = await this.pqc.kemEncapsulate(
        recipientBundle.oneTimePrekeys[oneTimePrekeyIndex]
      );
    }

    // 4. Combine shared secrets via HKDF
    const secrets = [lt.sharedSecret, spk.sharedSecret];
    if (otkResult) secrets.push(otkResult.sharedSecret);

    const sessionId = crypto.randomUUID();
    const sessionKey = await hkdfDerive(
      secrets,
      `starcom-fs-session-${sessionId}`
    );

    // 5. Zero ephemeral shared secrets
    lt.sharedSecret.fill(0);
    spk.sharedSecret.fill(0);
    if (otkResult) otkResult.sharedSecret.fill(0);

    log.debug(`Session initiated: ${sessionId} (with OTK: ${!!otkResult})`);

    return {
      sessionId,
      sessionKey,
      createdAt: Date.now(),
      ltCiphertext: lt.ciphertext,
      spkCiphertext: spk.ciphertext,
      otkCiphertext: otkResult?.ciphertext,
    };
  }

  /**
   * Accept an incoming session (recipient side).
   *
   * Decapsulates the ciphertexts using local private keys,
   * feeds shared secrets into HKDF → identical session key.
   */
  async acceptSession(
    sessionId: string,
    ltCiphertext: Uint8Array,
    spkCiphertext: Uint8Array,
    identityPrivateKey: Uint8Array,
    signedPrekeyPrivateKey: Uint8Array,
    otkCiphertext?: Uint8Array,
    otkPrivateKey?: Uint8Array
  ): Promise<Uint8Array> {
    // Decapsulate each ciphertext
    const ss1 = await this.pqc.kemDecapsulate(ltCiphertext, identityPrivateKey);
    const ss2 = await this.pqc.kemDecapsulate(spkCiphertext, signedPrekeyPrivateKey);

    const secrets = [ss1, ss2];
    if (otkCiphertext && otkPrivateKey) {
      const ss3 = await this.pqc.kemDecapsulate(otkCiphertext, otkPrivateKey);
      secrets.push(ss3);
    }

    const sessionKey = await hkdfDerive(secrets, `starcom-fs-session-${sessionId}`);

    // Zero intermediate shared secrets
    ss1.fill(0);
    ss2.fill(0);

    log.debug(`Session accepted: ${sessionId}`);
    return sessionKey;
  }

  /**
   * Derive per-message keys from a session key using a counter (simple ratchet).
   */
  async deriveMessageKey(sessionKey: Uint8Array, messageIndex: number): Promise<Uint8Array> {
    return hkdfDerive([sessionKey], `starcom-msg-${messageIndex}`);
  }

  /**
   * Check if a signed prekey needs rotation.
   */
  needsPrekeyRotation(signedPrekeyCreatedAt: number): boolean {
    return Date.now() - signedPrekeyCreatedAt > SIGNED_PREKEY_LIFETIME_MS;
  }
}

export { OTP_BATCH_SIZE, SIGNED_PREKEY_LIFETIME_MS };
