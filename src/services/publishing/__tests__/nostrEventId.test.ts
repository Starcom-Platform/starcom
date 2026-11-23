// @vitest-environment node
/**
 * The review's fingerprint for an event is the id its signature covers. Checked
 * against nostr-tools itself, in node, where @noble accepts the bytes.
 */
import { describe, it, expect } from 'vitest';
import { getEventHash, finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { nostrEventId } from '../nostrEventId';

describe('nostrEventId', () => {
  it('is the NIP-01 id nostr-tools computes, and the id a signature is made over', () => {
    const secret = generateSecretKey();
    const event = {
      pubkey: getPublicKey(secret),
      created_at: 1790400000,
      kind: 30081,
      tags: [['d', 'cap:mission:m-1:pk'], ['resource', 'mission:m-1'], ['action', 'dispatch']],
      content: 'reason with "quotes" and ünïcode',
    };

    expect(nostrEventId(event)).toBe(getEventHash(event));
    expect(finalizeEvent({ ...event, tags: event.tags.map((t) => [...t]) }, secret).id).toBe(nostrEventId(event));
  });
});
