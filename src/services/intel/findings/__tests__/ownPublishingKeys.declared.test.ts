/**
 * Declared keys: the ones this build says are ours.
 *
 * The file under test opens by describing a defect this project had — it
 * "corroborated itself, and contested itself, and reported both as independent
 * peers" — fixed by remembering every key the app signs with.
 *
 * That fix only ever covered the BROWSER. Every claim this project has actually
 * published was signed by the command line, which never calls `remember`, so the
 * node's own claims returning off the relays were about to be counted as a
 * stranger's agreement. Declared keys close that.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { ownPublishingKeys } from '../ownPublishingKeys';
import { NODE_CLAIM_PUBKEYS } from '../../../../config/nodeIdentity';

beforeEach(() => { ownPublishingKeys.reset(); });

describe('declared publishing keys', () => {
  it('recognises the node claim key this build publishes under', () => {
    // The key that signed the one claim currently in existence.
    expect(NODE_CLAIM_PUBKEYS.length).toBeGreaterThan(0);
    for (const key of NODE_CLAIM_PUBKEYS) {
      expect(ownPublishingKeys.has(key)).toBe(true);
    }
  });

  it('survives eviction, which is the whole reason it is a separate set', () => {
    /*
     * `remember` is capped at MAX_KEYS with FIFO eviction. Seeding the node key
     * into that set would have worked until ordinary browser signing pushed it
     * off the end — recognition that lapses silently after a fortnight is worse
     * than none, because nothing would report it.
     */
    const declared = NODE_CLAIM_PUBKEYS[0];
    for (let i = 0; i < 40; i++) ownPublishingKeys.remember(`browser-key-${i}`);

    expect(ownPublishingKeys.has(declared)).toBe(true);
    // And the remembered set really did evict, so the test above means something.
    expect(ownPublishingKeys.has('browser-key-0')).toBe(false);
    expect(ownPublishingKeys.has('browser-key-39')).toBe(true);
  });

  it('reset clears what was remembered and never what was declared', () => {
    ownPublishingKeys.remember('a-browser-key');
    expect(ownPublishingKeys.has('a-browser-key')).toBe(true);

    ownPublishingKeys.reset();

    expect(ownPublishingKeys.has('a-browser-key')).toBe(false);
    // A build fact is not state. A reset that forgot it would let a test pass
    // while the shipped behaviour differed.
    expect(ownPublishingKeys.has(NODE_CLAIM_PUBKEYS[0])).toBe(true);
  });

  it('still says no to a key that is neither', () => {
    expect(ownPublishingKeys.has('71f004ae-but-not-really')).toBe(false);
    expect(ownPublishingKeys.has(null)).toBe(false);
    expect(ownPublishingKeys.has(undefined)).toBe(false);
  });
});
