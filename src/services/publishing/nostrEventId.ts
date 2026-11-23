import { sha256Hex } from './publishReview';

/** The fields of a Nostr event that its id, and so its signature, cover. */
export interface UnsignedNostrEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: readonly (readonly string[])[];
  content: string;
}

/**
 * The NIP-01 event id: sha256 of [0, pubkey, created_at, kind, tags, content].
 * It is what the Schnorr signature signs, so it is the fingerprint the publish
 * review shows for an event (plan item 0.1).
 */
export function nostrEventId(event: Readonly<UnsignedNostrEvent>): string {
  return sha256Hex(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]));
}
