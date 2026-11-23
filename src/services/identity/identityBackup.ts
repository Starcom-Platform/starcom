/**
 * An identity a person can take with them — and the pure half of doing that.
 *
 * ─── WHY THIS IS SEPARATE FROM THE SERVICE ─────────────────────────────────
 *
 * The secret key lives in nostrService and does not leave it: these functions
 * convert BETWEEN bytes and the `nsec` text a person can write down or paste into
 * another client, and nostrService calls them. Keeping the conversion here means it
 * can be tested exhaustively — round trips, a truncated string, a pubkey pasted in
 * place of a secret, the wrong prefix — without a test ever holding the app's own
 * key, and without this file being able to read it.
 *
 * `nsec` is NIP-19's bech32 encoding, which is what every other Nostr client
 * imports and exports. A JSON byte array — which is what this app has been storing
 * — is not portable to anything.
 */
import { nip19 } from 'nostr-tools';

export class IdentityBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityBackupError';
  }
}

/** 32 secret bytes as the `nsec1…` text a person can keep. */
export function encodeNsec(secretKey: Uint8Array): string {
  if (secretKey.length !== 32) {
    throw new IdentityBackupError(
      `A Nostr secret key is 32 bytes; this is ${secretKey.length}. Refusing to encode it, `
      + 'because an nsec that decodes to the wrong key would look like a valid backup.',
    );
  }
  return nip19.nsecEncode(secretKey);
}

/**
 * The 32 secret bytes an `nsec1…` stands for.
 *
 * Refuses anything else by name rather than generically: a person pasting the wrong
 * string is the ordinary case here, and "that is your PUBLIC key" is the difference
 * between fixing it in a second and not knowing what went wrong.
 */
export function decodeNsec(nsec: string): Uint8Array {
  const text = nsec.trim();
  if (!text) throw new IdentityBackupError('Nothing to import.');

  let decoded: ReturnType<typeof nip19.decode>;
  try {
    decoded = nip19.decode(text);
  } catch {
    throw new IdentityBackupError(
      text.startsWith('nsec1')
        ? 'That looks like an nsec but does not decode — a character may be missing or wrong.'
        : 'That is not a Nostr key. A secret key starts with "nsec1".',
    );
  }

  if (decoded.type === 'npub') {
    throw new IdentityBackupError(
      'That is your PUBLIC key (npub). Importing it would not let you sign anything — '
      + 'the secret key starts with "nsec1".',
    );
  }
  if (decoded.type !== 'nsec') {
    throw new IdentityBackupError(`That is a ${decoded.type}, not a secret key.`);
  }

  const bytes = decoded.data as Uint8Array;
  if (bytes.length !== 32) {
    throw new IdentityBackupError(`Decoded to ${bytes.length} bytes, not 32. Refusing to use it.`);
  }
  return bytes;
}
