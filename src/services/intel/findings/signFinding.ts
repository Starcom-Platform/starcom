import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import {
  ML_DSA_65_PUBKEY_BYTES, ML_DSA_65_SIG_BYTES, decodeKeyMaterial,
} from '../../exchange/signatureEncoding';
import type { FindingContent } from './FindingContent';
import type { FindingAttestation } from './attestation';
import type { FindingRetraction } from './retraction';
import type { FindingRefutation } from './refutation';

/**
 * ML-DSA-65 signing for a Findings Publisher payload — same digest
 * construction (stable-stringify, SHA-256) and the same signature-block
 * shape as exchange/signing.ts's createMLDSASigner, deliberately
 * reimplemented here rather than imported: createMLDSASigner is typed
 * specifically to PackageManifest and injects the signature into
 * `manifest.metadata`, a field a Finding doesn't have (and shouldn't grow
 * just to satisfy that signature — see FindingContent's doc comment on
 * why a finding is not a PackageManifest). Same pattern, same underlying
 * ml_dsa65 primitive, a type that actually fits this content.
 *
 * This is a second, independent, post-quantum-safe integrity proof over
 * the finding's content — it does not, and cannot, replace the outer
 * Nostr event's own Schnorr/secp256k1 signature, which NIP-01 mandates.
 */
/**
 * Anything publishable under a finding's signature.
 *
 * Widened when v2 landed: the signature covers whatever the payload IS, and a
 * payload is now a v1 FindingContent, a v2 attestation, a retraction, or a
 * refutation. Pinning it to one shape would have meant either a separate
 * signing path per type — four chances to get the digest subtly wrong — or
 * unsigned payloads for the new kinds.
 *
 * A UNION rather than an index signature, deliberately: the index signature
 * compiled but accepted any object at all, which would have let a
 * wrong-shaped payload be signed and broadcast with a perfectly valid
 * signature over nonsense.
 */
export type SignableFindingContent =
  | FindingContent
  | FindingAttestation
  | FindingRetraction
  | FindingRefutation;

export interface SignedFinding {
  content: SignableFindingContent;
  signature: {
    alg: 'ml-dsa-65';
    pubkey: string;
    sig: string;
  };
}

/**
 * Canonical JSON for digesting: object keys sorted, no incidental whitespace.
 *
 * Exported because canonicalization — not ML-DSA — is the part of this format
 * an independent implementation is most likely to get subtly wrong, and the
 * conformance vectors in docs/spec/vectors/ publish the exact canonical string
 * for each example so a fork can check its own stringifier against ours.
 * Generating those vectors with a *reimplementation* of this function would
 * make them vectors for the reimplementation, not for what we actually sign.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** SHA-256 over the canonical JSON. The bytes an ML-DSA signature covers. */
export function contentDigest(content: SignableFindingContent): Uint8Array {
  return sha256(utf8ToBytes(stableStringify(content)));
}

/** Signs a finding's content under this instance's persisted manifest-signing key (see ManifestSigningKeyStore — same key used for Mission Package manifests, so a verifier can attribute both content types to the same source). */
export function signFinding(content: SignableFindingContent, secretKey: Uint8Array): SignedFinding {
  const digest = contentDigest(content);
  const pub = ml_dsa65.getPublicKey(secretKey);
  const sig = ml_dsa65.sign(digest, secretKey);
  return {
    content,
    signature: {
      alg: 'ml-dsa-65',
      pubkey: bytesToHex(pub),
      sig: bytesToHex(sig)
    }
  };
}

export function verifyFindingSignature(signed: SignedFinding): boolean {
  // Hex or base64, for the reason signing.ts gives at length: a peer emits
  // base64, hexToBytes throws on it, and the throw below turned a genuine
  // Finding into a failed verification with no error anywhere.
  try {
    const digest = contentDigest(signed.content);
    return ml_dsa65.verify(
      decodeKeyMaterial(signed.signature.sig, ML_DSA_65_SIG_BYTES),
      digest,
      decodeKeyMaterial(signed.signature.pubkey, ML_DSA_65_PUBKEY_BYTES),
    );
  } catch {
    return false;
  }
}
