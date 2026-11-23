import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findingIdentifier, identifierFor } from '../FindingContent';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';
import { acknowledge } from '../publisherConsent';

/*
 * The publisher acknowledgement is a real gate on publishFinding: Starcom holds
 * no signing key, so a publish is a person signing under their own. These tests
 * exercise everything AFTER that gate, so they acknowledge in setup rather than
 * being exempted from it — the gate itself has its own tests.
 */
beforeEach(() => acknowledge());


const publishFindingMock = vi.fn();
vi.mock('../FindingsBroadcastService', async (orig) => {
  const actual = await orig<typeof import('../FindingsBroadcastService')>();
  return {
    ...actual,
    FindingsBroadcastService: class {
      publishFinding(...a: unknown[]) { return publishFindingMock(...a); }
      dispose() { /* no-op */ }
    },
  };
});
vi.mock('../../../identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => 'pk', signerPubkey: () => 'pk', refreshSigner: async () => 'pk', hasExtension: () => false, asSigner: () => ({}),
  },
}));
// The real key store persists to IndexedDB, which the node test env lacks.
vi.mock('../../../crypto/ManifestSigningKeyStore', async () => {
  const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
  const keys = ml_dsa65.keygen();
  return { manifestSigningKeyStore: { getOrCreate: async () => keys } };
});

const { publishFinding } = await import('../FindingsPublisherService');

const base: CorroboratedFinding = {
  // publicationPolicy refuses evidence that is not explicitly known-real.
  isMock: false,
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 1, lon: 2 },
  confidence: 0.82, sourceCount: 3,
  observedFrom: '2026-08-19T22:00:00.000Z', observedTo: '2026-08-19T23:00:00.000Z',
  subjectKind: 'organization', timePrecisionMs: 86_400_000,
  contributingFingerprints: ['aaaa', 'bbbb'],
  algorithmVersion: 1,
};

describe('the publisher emits v2 attestations', () => {
  beforeEach(() => {
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'e1', relaysOk: 3 });
  });

  it('publishes schemaVersion 2 with a method block', async () => {
    await publishFinding(base);
    const [signed] = publishFindingMock.mock.calls[0];
    expect(signed.content.schemaVersion).toBe(2);
    expect(signed.content.method.algorithm).toBe('location-corroboration');
  });

  it('never puts the declared confidence on the wire', async () => {
    await publishFinding(base);
    const [signed] = publishFindingMock.mock.calls[0];
    // The finding HAS one; it must not survive publication.
    expect(base.confidence).toBe(0.82);
    expect(signed.content).not.toHaveProperty('confidence');
    /**
     * Structurally and at EVERY depth.
     *
     * Two wrong versions preceded this one. The first asserted the serialised
     * content does not CONTAIN "0.82", which also matches a publishedAt whose
     * milliseconds read ...50.825Z — a real timestamp this suite produced,
     * failing a test about confidence for reasons that had nothing to do with
     * confidence. The replacement used `JSON.stringify(x, (_k, v) => v)`, which
     * is a no-op replacer, so the round-trip was a deep clone and the two
     * assertions checked only the top level and `method` — strictly WEAKER than
     * the substring scan it replaced, and blind to exactly where the type
     * change later made a declared confidence legal: method.parameters.
     *
     * The fix for a too-loose match is a precise one, not a shallower one.
     */
    const keysAnywhere = (v: unknown, depth = 0): string[] => {
      if (depth > 8 || typeof v !== 'object' || v === null) return [];
      if (Array.isArray(v)) return v.flatMap((x) => keysAnywhere(x, depth + 1));
      return Object.entries(v).flatMap(([k, x]) => [k, ...keysAnywhere(x, depth + 1)]);
    };
    const found = keysAnywhere(signed.content);
    expect(found).not.toContain('confidence');
    expect(found).not.toContain('weight');
    expect(found).not.toContain('score');
  });

  it('carries the reproducibility envelope', async () => {
    await publishFinding(base);
    const [signed] = publishFindingMock.mock.calls[0];
    expect(signed.content.method.inputFingerprints).toEqual(['aaaa', 'bbbb']);
  });

  it('carries subject kind and the coarsest contributing precision', async () => {
    await publishFinding(base);
    const [signed] = publishFindingMock.mock.calls[0];
    expect(signed.content.claim.subjectKind).toBe('organization');
    expect(signed.content.method.timePrecisionMs).toBe(86_400_000);
  });
});

describe('the person gate runs before anything is signed', () => {
  beforeEach(() => {
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue({ success: true });
  });

  it('refuses a finding about a person, and signs nothing', async () => {
    const result = await publishFinding({ ...base, subjectKind: 'person' });

    expect(result.refused?.requiresExplicitConsent).toBe(true);
    // A refused finding must leave NO artifact — not a signed payload, not a
    // broadcast attempt.
    expect(publishFindingMock).not.toHaveBeenCalled();
  });

  it('does not queue a refused finding for retry', async () => {
    // Refusal is a decision, not an outage. Retrying it would be retrying a
    // policy.
    const result = await publishFinding({ ...base, subjectKind: 'person' });
    expect(result.queued).toBe(false);
  });

  it('publishes a person in a public role on explicit consent', async () => {
    await publishFinding({ ...base, subjectKind: 'person' },
      { consentToPublishAboutPerson: true, subjectRole: 'public-office' });
    expect(publishFindingMock).toHaveBeenCalledTimes(1);
  });

  it('signs nothing for a private individual on consent alone', async () => {
    // The old version of the test above asserted that consent alone was
    // sufficient for any person. It is the rule that published a whistleblower's
    // identity in the sixteen-case stress test.
    await publishFinding({ ...base, subjectKind: 'person' }, { consentToPublishAboutPerson: true });
    expect(publishFindingMock).not.toHaveBeenCalled();
  });

  it('publishes organisations without ceremony', async () => {
    await publishFinding(base);
    expect(publishFindingMock).toHaveBeenCalledTimes(1);
  });
});

describe('the d tag is stable across v1, v2 and retraction', () => {
  it('derives the same slot from every shape', () => {
    const expected = identifierFor('Acme Corp', 'location');

    // A v2 finding must REPLACE its v1 predecessor, not land beside it; a
    // retraction must withdraw the slot it names.
    expect(findingIdentifier({ content: { claim: { entityRef: 'Acme Corp', attribute: 'location' } } })).toBe(expected);
    expect(findingIdentifier({ content: { claim: { subjectRef: 'Acme Corp', attribute: 'location' } } })).toBe(expected);
    expect(findingIdentifier({ content: { retracts: { subjectRef: 'Acme Corp', attribute: 'location' } } })).toBe(expected);
  });
});
