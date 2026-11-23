import { getPublicKey, sign, verify } from '@noble/ed25519';
import * as Ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import type { PackageManifest } from './types';
import {
  ML_DSA_65_PUBKEY_BYTES, ML_DSA_65_SIG_BYTES,
  ED25519_PUBKEY_BYTES, ED25519_SIG_BYTES,
  decodeKeyMaterial,
} from './signatureEncoding';
// Configure noble-ed25519 to use sha512 for sync operations
// See: https://github.com/paulmillr/noble-ed25519
type NobleEtc = { sha512Sync?: (msg: Uint8Array) => Uint8Array };
(Ed25519 as unknown as { etc: NobleEtc }).etc.sha512Sync = (msg: Uint8Array) => sha512(msg);

// ML-DSA-65 (FIPS 204), paired with this app's existing ML-KEM-768 usage at
// the same ~192-bit security category. This signs the MANIFEST payload
// only — it does not, and cannot, replace the outer Nostr event's own
// Schnorr/secp256k1 signature, which NIP-01 mandates; this is a second,
// independent, post-quantum-safe integrity proof over the package content
// itself, verifiable even if secp256k1 is later broken by a quantum
// adversary. Real ML-DSA-65 (FIPS 204) via @noble/post-quantum, not a
// placeholder or classical substitute.
type SignatureBlock =
  | { alg: 'ed25519'; pubkey: string; sig: string }
  | { alg: 'ml-dsa-65'; pubkey: string; sig: string };
type ManifestMetadata = Record<string, unknown> & { signature?: SignatureBlock };

/**
 * Canonical JSON for the signed digest. Keys sort by UTF-16 CODE UNIT.
 *
 * This used `a.localeCompare(b)`, which is locale- and ICU-dependent: with the
 * same input, full-icu and small-icu Node builds — or two machines with
 * different default locales — can order keys differently, produce different
 * digests, and fail to verify each other's signatures. Demonstrated rather
 * than assumed: sorting ['Status','author','Zulu','apple','ändern'] by locale
 * gives a completely different order than by code unit.
 *
 * Code-unit ordering is what RFC 8785 (JSON Canonicalization Scheme) specifies
 * and what any second implementation would reach for by default, because it is
 * the behaviour of a bare `<` comparison in every language.
 *
 * Backward compatible for every manifest this code can currently emit: all
 * manifest, metadata, report-entry and signature-block keys are lowercase
 * ASCII, for which both orderings agree. It removes a latent divergence rather
 * than invalidating existing signatures.
 */
/**
 * Canonical form for the digest: keys sorted, output stable.
 *
 * ─── IT WAS NOT STABLE ACROSS A JSON ROUND TRIP ────────────────────────────
 *
 * `Object.entries` includes a key whose value is `undefined`, and
 * `JSON.stringify(undefined)` returns the JS value `undefined`, which template
 * interpolation renders as the text "undefined". So a manifest carrying
 * `visibility: undefined` hashed as
 *
 *   {"id":"p","name":"n","visibility":undefined}
 *
 * on the signing side. The same manifest sent over the wire loses that key
 * entirely — JSON.stringify drops undefined-valued properties — so the
 * receiver hashed
 *
 *   {"id":"p","name":"n"}
 *
 * and the signature did not verify. A GENUINE package from a genuine node,
 * refused.
 *
 * Nothing hit it while every manifest field was required. Making one field
 * optional was enough, and it surfaced as four verifier tests failing on
 * "accepts a genuine round trip" rather than as anything pointing at the
 * digest.
 *
 * Skipping undefined-valued keys matches JSON.stringify's own behaviour, which
 * is the only behaviour that matters here: the digest must agree on both sides
 * of a JSON round trip, because that is the trip every package makes.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * The digest a manifest signature covers: the manifest without its signature
 * block, canonicalised. Exported so the publish review can show a person the
 * same fingerprint the signer signs (plan item 0.1).
 */
export function manifestDigest(manifest: PackageManifest): Uint8Array {
  const meta: ManifestMetadata = { ...(manifest.metadata as ManifestMetadata) };
  // exclude existing signature block from digest if present
  const metaForDigest: ManifestMetadata = meta.signature ? (({ signature: _signature, ...rest }) => rest)(meta) : meta;
  const m: PackageManifest = { ...manifest, metadata: metaForDigest };
  const msg = utf8ToBytes(stableStringify(m));
  return sha256(msg);
}

export function createEd25519Signer(privateKeyHex: string) {
  return async function signManifest(manifest: PackageManifest): Promise<PackageManifest> {
    const digest = manifestDigest(manifest);
    const priv = hexToBytes(privateKeyHex);
    const pub = await getPublicKey(priv);
    const sig = await sign(digest, priv);
    const signatureBlock: SignatureBlock = {
      alg: 'ed25519',
      pubkey: bytesToHex(pub),
      sig: bytesToHex(sig),
    };
    const metadata: ManifestMetadata = { ...((manifest.metadata as ManifestMetadata) || {}), signature: signatureBlock };
    return { ...manifest, metadata };
  };
}

/**
 * ML-DSA-65 equivalent of createEd25519Signer — same digest (stable-stringify
 * the manifest, excluding any pre-existing signature block, SHA-256 it),
 * signed with a real ML-DSA-65 secret key instead of Ed25519.
 */
export function createMLDSASigner(secretKeyHex: string) {
  return async function signManifest(manifest: PackageManifest): Promise<PackageManifest> {
    const digest = manifestDigest(manifest);
    const secretKey = hexToBytes(secretKeyHex);
    const pub = ml_dsa65.getPublicKey(secretKey);
    const sig = ml_dsa65.sign(digest, secretKey);
    const signatureBlock: SignatureBlock = {
      alg: 'ml-dsa-65',
      pubkey: bytesToHex(pub),
      sig: bytesToHex(sig),
    };
    const metadata: ManifestMetadata = { ...((manifest.metadata as ManifestMetadata) || {}), signature: signatureBlock };
    return { ...manifest, metadata };
  };
}

export async function verifyManifestSignature(manifest: PackageManifest): Promise<boolean> {
  const md = (manifest.metadata as ManifestMetadata) || {};
  const signature = md.signature;
  if (!signature || !signature.pubkey || !signature.sig) return false;
  const digest = manifestDigest(manifest);
  /*
   * Hex OR base64, decided by which one decodes to the right number of bytes.
   *
   * This called hexToBytes on both fields. The peer node emits base64 — they
   * asked which encoding the spec meant after rev 6, again after rev 7, and a
   * third time on 2026-09-23 calling it the one thing blocking their first
   * package. Noble throws on a non-hex string, the throw landed in the catch
   * below, and the function returned false: a genuine package from a genuine
   * node refused as a forgery, silently, on both sides.
   *
   * The catch stays, because a malformed signature really is a failed
   * verification. What changed is that an unreadable ENCODING is no longer
   * mistaken for one. See signatureEncoding.ts.
   */
  try {
    if (signature.alg === 'ed25519') {
      return await verify(
        decodeKeyMaterial(signature.sig, ED25519_SIG_BYTES),
        digest,
        decodeKeyMaterial(signature.pubkey, ED25519_PUBKEY_BYTES),
      );
    }
    if (signature.alg === 'ml-dsa-65') {
      return ml_dsa65.verify(
        decodeKeyMaterial(signature.sig, ML_DSA_65_SIG_BYTES),
        digest,
        decodeKeyMaterial(signature.pubkey, ML_DSA_65_PUBKEY_BYTES),
      );
    }
    return false;
  } catch {
    return false;
  }
}
