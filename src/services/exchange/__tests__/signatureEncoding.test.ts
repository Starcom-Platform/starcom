/**
 * A signature that does not verify because of its ENCODING is the worst kind of
 * interop bug: silent on both sides.
 *
 * ─── THE REPORT ────────────────────────────────────────────────────────────
 *
 * Asked by the peer node after spec rev 6, unanswered in rev 7 and rev 8, and
 * raised a third time on 2026-09-23 as the one thing blocking their first
 * Mission Package:
 *
 *   "How are the `pubkey` and `sig` bytes encoded in the ML-DSA-65 signature
 *    block? The spec is precise about everything around it — algorithm,
 *    canonicalisation, digest, block shape — and then `string`, with no
 *    encoding named. An ML-DSA-65 public key is 1952 bytes and a signature is
 *    3309; base64 and hex are both plausible and they are not interchangeable.
 *    We emit base64 and accept either on read. If your verifier assumes hex,
 *    every package we send is refused, and the failure is silent on both
 *    sides: you see nothing arrive, we see nothing rejected."
 *
 * They were right. `verifyManifestSignature` called `hexToBytes` on both
 * fields; noble throws on a non-hex string; the throw was swallowed by the
 * catch and returned `false`. A genuine, correctly signed package from a
 * genuine node, refused as a forgery.
 *
 * ─── AND A SECOND BUG THE FIRST ONE HID ────────────────────────────────────
 *
 * `signature.pubkey` is not only key material here — it is an IDENTITY STRING.
 * `ownPublishingKeys.remember/has` uses it to recognise our own publications,
 * and `ForeignFindingStore`/`RefutationStore` use it as the author. So the same
 * key in two encodings is two different authors: a peer would fail their own
 * self-publication check, and their findings would split across two identities
 * that never merge. Accepting both encodings without normalising would have
 * created that bug in the act of fixing this one.
 *
 * So decoding is tolerant and identity is canonical: lowercase hex, always.
 */
import { describe, it, expect } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import { PackageComposer } from '../PackageComposer';
import { createMLDSASigner, verifyManifestSignature } from '../signing';
import type { PackageManifest } from '../types';
import {
  ML_DSA_65_PUBKEY_BYTES,
  ML_DSA_65_SIG_BYTES,
  decodeKeyMaterial,
  canonicalKeyString,
} from '../signatureEncoding';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const keys = ml_dsa65.keygen(randomBytes(32));
const pub = keys.publicKey;

describe('signature encoding: the sizes are the discriminator', () => {
  it('states the FIPS 204 sizes it relies on', () => {
    // If these are wrong, every length-based decision below is wrong with them.
    expect(pub.length).toBe(ML_DSA_65_PUBKEY_BYTES);
    // Argument order is (message, secretKey), as signing.ts uses it.
    expect(ml_dsa65.sign(new Uint8Array(32), keys.secretKey).length).toBe(ML_DSA_65_SIG_BYTES);
  });

  it('decodes a hex public key', () => {
    expect(decodeKeyMaterial(bytesToHex(pub), ML_DSA_65_PUBKEY_BYTES)).toEqual(pub);
  });

  it('decodes a base64 public key — the peer\'s encoding', () => {
    expect(decodeKeyMaterial(toBase64(pub), ML_DSA_65_PUBKEY_BYTES)).toEqual(pub);
  });

  it('decodes uppercase hex, which is still hex', () => {
    expect(decodeKeyMaterial(bytesToHex(pub).toUpperCase(), ML_DSA_65_PUBKEY_BYTES)).toEqual(pub);
  });

  it('refuses a string that decodes to the wrong length', () => {
    // Truncation is the failure a length check exists to catch: a short key
    // that still parses as hex would otherwise reach the verifier as garbage.
    expect(() => decodeKeyMaterial(bytesToHex(pub).slice(0, 100), ML_DSA_65_PUBKEY_BYTES)).toThrow();
  });

  it('refuses a string that is neither encoding', () => {
    expect(() => decodeKeyMaterial('not a key at all', ML_DSA_65_PUBKEY_BYTES)).toThrow();
  });

  it('refuses an empty string rather than returning empty bytes', () => {
    expect(() => decodeKeyMaterial('', ML_DSA_65_PUBKEY_BYTES)).toThrow();
  });
});

describe('signature encoding: identity is canonical', () => {
  it('maps both encodings of one key to the same identity string', () => {
    const fromHex = canonicalKeyString(bytesToHex(pub), ML_DSA_65_PUBKEY_BYTES);
    const fromB64 = canonicalKeyString(toBase64(pub), ML_DSA_65_PUBKEY_BYTES);

    // The whole point: a peer emitting base64 and a peer emitting hex are ONE
    // author, not two. Without this, ownPublishingKeys.has() misses our own
    // publications and a foreign author's findings split in half.
    expect(fromB64).toBe(fromHex);
  });

  it('is lowercase hex, matching how Nostr writes a key in an identity position', () => {
    expect(canonicalKeyString(toBase64(pub), ML_DSA_65_PUBKEY_BYTES)).toBe(bytesToHex(pub));
    expect(canonicalKeyString(bytesToHex(pub).toUpperCase(), ML_DSA_65_PUBKEY_BYTES))
      .toBe(bytesToHex(pub));
  });
});

/**
 * The end-to-end claim, and the only one the peer actually cares about: a
 * manifest signed the way THEY sign it verifies here.
 *
 * Everything above tests the decoder in isolation. This tests the thing that
 * was broken — a correctly signed package arriving in base64 and being refused
 * as a forgery by a verifier that only spoke hex.
 */
describe('a package signed the peer\'s way', () => {
  const rewriteSignatureAsBase64 = (manifest: PackageManifest): PackageManifest => {
    const metadata = manifest.metadata as Record<string, unknown>;
    const block = metadata.signature as { alg: string; pubkey: string; sig: string };
    return {
      ...manifest,
      metadata: {
        ...metadata,
        signature: {
          ...block,
          pubkey: toBase64(hexToBytes(block.pubkey)),
          sig: toBase64(hexToBytes(block.sig)),
        },
      },
    };
  };

  const manifest = () => PackageComposer.compose({
    name: 'Signed Package', description: 'test', license: 'CC0',
    author: 'tester', reports: [], intel: [], assets: [],
  }).manifest;

  it('verifies when the signature block is base64', async () => {
    const { secretKey } = ml_dsa65.keygen();
    const signed = await createMLDSASigner(bytesToHex(secretKey))(manifest());

    expect(await verifyManifestSignature(rewriteSignatureAsBase64(signed))).toBe(true);
  });

  it('still verifies when it is hex, which is what we emit', async () => {
    const { secretKey } = ml_dsa65.keygen();
    const signed = await createMLDSASigner(bytesToHex(secretKey))(manifest());

    expect(await verifyManifestSignature(signed)).toBe(true);
  });

  it('still refuses a base64 signature over different content', async () => {
    // Tolerating the encoding must not tolerate a bad signature. If this ever
    // passes, the decoder has started inventing bytes.
    const { secretKey } = ml_dsa65.keygen();
    const signed = await createMLDSASigner(bytesToHex(secretKey))(manifest());
    const tampered = { ...rewriteSignatureAsBase64(signed), name: 'Something else entirely' };

    expect(await verifyManifestSignature(tampered)).toBe(false);
  });
});
