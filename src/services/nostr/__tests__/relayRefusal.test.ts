/**
 * A note is refused for good only when every relay that answered said so in NIP-01's lasting words (W1).
 */
import { describe, it, expect } from 'vitest';
import { refusedForGood } from '../relayRefusal';

describe('refusedForGood', () => {
  it('is every answer a lasting refusal: blocked, invalid, restricted, pow or mute', () => {
    expect(refusedForGood(['blocked: pubkey not on EIN allowlist for this relay', 'invalid: bad signature'])).toBe(true);
    expect(refusedForGood(['restricted: members only', 'pow: difficulty 20 needed', 'mute: no'])).toBe(true);
  });

  it('is not when any relay did not answer, timed out, failed, or may take it later', () => {
    expect(refusedForGood([])).toBe(false);
    expect(refusedForGood(['blocked: no', 'connection failed'])).toBe(false);
    expect(refusedForGood(['error: no connection'])).toBe(false);
    expect(refusedForGood(['rate-limited: slow down'])).toBe(false);
    expect(refusedForGood(['auth-required: sign in first'])).toBe(false);
    expect(refusedForGood(['publish timed out'])).toBe(false);
  });
});
