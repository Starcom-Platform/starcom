/**
 * The gate that tells a person they are the publisher.
 *
 * Starcom holds no signing key — signEvent takes a key the caller supplies or
 * a NIP-07 extension, and throws with neither. So a published finding is
 * signed by the OPERATOR, and a person using this app puts a permanent signed
 * assertion on public relays under their own name, sometimes about a named
 * individual, in their own jurisdiction.
 *
 * publicationPolicy already forces deliberation about the CLAIM. This forces
 * knowing who answers for it, once.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  acknowledge, publisherConsentRefusal,
  PUBLISHER_ACKNOWLEDGEMENT,
  type ConsentStore,
} from '../publisherConsent';

/**
 * Asserted through publisherConsentRefusal rather than a state getter,
 * because that is the API every caller actually uses — and the orphan-export
 * guard was right that a getter exported only for a test is a capability
 * existing nowhere else.
 */
const acknowledged = (pubkey?: string, store?: ConsentStore | null) =>
  publisherConsentRefusal(pubkey, store) === null;

const memoryStore = (): ConsentStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
};

describe('publisher acknowledgement', () => {
  let store: ConsentStore;
  beforeEach(() => { store = memoryStore(); });

  it('blocks before the first publish and not after', () => {
    expect(publisherConsentRefusal(undefined, store)).not.toBeNull();
    acknowledge(undefined, store);
    expect(publisherConsentRefusal(undefined, store)).toBeNull();
  });

  it('asks again for a different key, because the liability follows the key', () => {
    acknowledge('key-a', store);
    expect(acknowledged('key-a', store)).toBe(true);
    // A different key is a different person answering for it.
    expect(acknowledged('key-b', store)).toBe(false);
  });

  it('shows the notice again when storage refuses, rather than assuming it was seen', () => {
    // Private mode, or storage blocked. The failure direction matters: treating
    // a failed write as success would silently stop telling people.
    const throwing: ConsentStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(() => acknowledge('k', throwing)).not.toThrow();
    expect(acknowledged('k', throwing)).toBe(false);
    expect(publisherConsentRefusal('k', throwing)).not.toBeNull();
  });

  it('treats an absent store as not acknowledged', () => {
    expect(acknowledged('k', null)).toBe(false);
    expect(publisherConsentRefusal('k', null)).not.toBeNull();
  });

  it('refuses in the shape callers already handle', () => {
    const refusal = publisherConsentRefusal(undefined, store)!;
    // Same shape as a policy refusal, so no caller needs a new branch.
    expect(refusal.requiresExplicitConsent).toBe(true);
    expect(refusal.reason).toMatch(/published under your own key/);
  });
});

describe('what the person is actually told', () => {
  it('states the four facts, and each is true of this system', () => {
    const text = PUBLISHER_ACKNOWLEDGEMENT.points.join(' ').toLowerCase();
    // Signed by them, not by an organisation — Starcom has no signing key.
    expect(text).toMatch(/your key/);
    expect(text).toMatch(/no signing key/);
    // Public, permanent, and nobody here can delete it.
    expect(text).toMatch(/public relays/);
    expect(text).toMatch(/permanent/);
    // Retraction works, with its real limit stated rather than implied.
    expect(text).toMatch(/retracted/);
    expect(text).toMatch(/cached/);
    // A claim about a person is the heaviest case.
    expect(text).toMatch(/named person/);
  });

  it('does not ask anyone to agree to anything', () => {
    // Nothing is being granted to this project. A consent screen that collects
    // an agreement it does not need is asking for something under false
    // pretences.
    expect(PUBLISHER_ACKNOWLEDGEMENT.confirm.toLowerCase()).not.toMatch(/agree|accept|terms/);
    expect(PUBLISHER_ACKNOWLEDGEMENT.confirm).toBe('I understand');
  });
});
