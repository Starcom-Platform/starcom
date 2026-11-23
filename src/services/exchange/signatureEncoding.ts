/**
 * How the bytes in a signature block are written down, and read back.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The interchange spec was precise about the algorithm (ML-DSA-65, FIPS 204),
 * the canonicalisation (keys sorted by UTF-16 code unit), the digest
 * (SHA-256 over canonical JSON) and the block shape — and then said `string`,
 * naming no encoding. An ML-DSA-65 public key is 1952 bytes and a signature is
 * 3309; hex and base64 are both plausible and they are not interchangeable.
 *
 * The peer node asked which it was after rev 6, again after rev 7, and a third
 * time on 2026-09-23, calling it the one thing blocking their first Mission
 * Package. They were right to keep asking. They emit base64; this node emitted
 * hex and called `hexToBytes` on whatever arrived. Noble throws on a non-hex
 * string, the throw was caught, and the function returned `false` — so a
 * genuine package from a genuine node was refused as a forgery, with no error
 * on either side. They predicted that exact shape: "you see nothing arrive, we
 * see nothing rejected."
 *
 * ─── THE RULE ──────────────────────────────────────────────────────────────
 *
 *   read   BOTH hex and base64, permanently, never transitionally
 *   write  lowercase hex
 *   key    lowercase hex, always, wherever a pubkey is used as an IDENTITY
 *
 * Tolerant on read because the alternative is silently refusing correct work.
 * Hex on write because in this protocol a pubkey is not only key material: it
 * is an identity string, and Nostr writes keys in identity positions as
 * lowercase hex (NIP-01). Consistency with the surrounding protocol is worth
 * more here than base64's ~33% saving on the wire.
 *
 * ─── THE BUG THIS DELIBERATELY AVOIDS CREATING ─────────────────────────────
 *
 * `signature.pubkey` is used as an identity key in several places —
 * `ownPublishingKeys.remember/has` for recognising our own publications, and
 * `ForeignFindingStore`/`RefutationStore` for the author. Accepting two
 * encodings without canonicalising would make one key into two authors: a peer
 * would fail their own self-publication check, and their findings would split
 * across two identities that never merge. Tolerance on the wire therefore
 * requires canonicalisation at the boundary, not instead of it.
 *
 * ─── WHY LENGTH, NOT PATTERN, DECIDES ──────────────────────────────────────
 *
 * The base64 alphabet contains every hex digit, so a base64 string can in
 * principle be valid hex. What it cannot do is decode to the right number of
 * bytes under both readings: 1952 bytes is 3904 hex characters or 2604 base64
 * characters, and a string of one length is not a string of the other. So the
 * decoder tries each and keeps the reading that yields the expected size. That
 * also catches truncation, which a pattern test would wave through.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/** FIPS 204 ML-DSA-65 public key size. */
export const ML_DSA_65_PUBKEY_BYTES = 1952;
/** FIPS 204 ML-DSA-65 signature size. */
export const ML_DSA_65_SIG_BYTES = 3309;
/** Ed25519, for the legacy signature block this node still verifies. */
export const ED25519_PUBKEY_BYTES = 32;
export const ED25519_SIG_BYTES = 64;

function fromHex(value: string): Uint8Array | null {
  if (value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) return null;
  try {
    return hexToBytes(value.toLowerCase());
  } catch {
    return null;
  }
}

function fromBase64(value: string): Uint8Array | null {
  // Standard alphabet with optional padding. The URL-safe alphabet is accepted
  // too: a peer encoding with `base64url` would otherwise be refused for a
  // difference that carries no information.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(standard);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Decode key material written as hex or base64, and prove its size.
 *
 * Throws rather than returning null: every caller here is a verifier, and a
 * verifier that treats "I could not read this" as "this did not verify" is how
 * the original bug stayed invisible. The message names what was expected so a
 * peer reading a log can act on it.
 */
export function decodeKeyMaterial(value: string, expectedBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${expectedBytes} bytes of key material, got an empty value`);
  }

  for (const decoded of [fromHex(value), fromBase64(value)]) {
    if (decoded && decoded.length === expectedBytes) return decoded;
  }

  throw new Error(
    `Could not read ${expectedBytes} bytes of key material from a ${value.length}-character string. ` +
    `Expected ${expectedBytes * 2} hex characters or ${Math.ceil(expectedBytes / 3) * 4} base64 characters.`,
  );
}

/**
 * The canonical form of a public key, for use as an identity.
 *
 * Lowercase hex, whatever arrived. Two nodes writing the same key differently
 * must land on the same string here or they are two authors.
 */
export function canonicalKeyString(value: string, expectedBytes: number): string {
  return bytesToHex(decodeKeyMaterial(value, expectedBytes));
}
