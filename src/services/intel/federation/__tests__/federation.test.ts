import { describe, it, expect, beforeEach } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ownPublishingKeys } from '../../findings/ownPublishingKeys';
import { ForeignFindingStore } from '../ForeignFindingStore';
import { assessForeignFinding, type ForeignFinding } from '../foreignFinding';
import { signFinding } from '../../findings/signFinding';
import { buildFindingAttestation } from '../../findings/FindingContent';
import { buildRetraction } from '../../findings/retraction';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const NOW = () => new Date('2026-08-21T00:00:00Z');
const peer = ml_dsa65.keygen();

const finding = (fingerprints: string[], sourceCount = 3): CorroboratedFinding => ({
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 1, lon: 2 },
  confidence: 0.8, sourceCount,
  observedFrom: '2026-08-20T22:00:00.000Z', observedTo: '2026-08-20T23:00:00.000Z',
  subjectKind: 'organization', timePrecisionMs: 86_400_000,
  contributingFingerprints: fingerprints, algorithmVersion: 1,
});

const publishAs = (keys: typeof peer, fingerprints: string[], sourceCount = 3) =>
  signFinding(
    buildFindingAttestation(finding(fingerprints, sourceCount), { modality: 'inference', weakBacking: [],
      subjectKind: 'organization', timePrecisionMs: 86_400_000, inputFingerprints: fingerprints,
    }, NOW),
    keys.secretKey,
  );

describe('accepting findings from other instances', () => {
  let store: ForeignFindingStore;
  beforeEach(() => { store = new ForeignFindingStore(); });

  it('accepts a correctly signed v2 finding', () => {
    expect(store.accept(publishAs(peer, ['aa', 'bb'])).accepted).toBe(true);
    expect(store.all()).toHaveLength(1);
  });

  it('rejects a tampered payload rather than storing it', () => {
    const signed = publishAs(peer, ['aa']);
    (signed.content as { claim: { subjectRef: string } }).claim.subjectRef = 'Someone Else';

    const result = store.accept(signed);

    // An unverified finding in the store is worse than none: it looks exactly
    // like a verified one at every later point, and nothing re-checks.
    expect(result).toEqual({ accepted: false, reason: 'invalid-signature' });
    expect(store.all()).toHaveLength(0);
  });

  it('rejects an enumeration that does not state what it enumerated', () => {
    // A census claims a COUNT. `enumeratedBoundary` is the only thing that
    // makes the count re-runnable, so its absence is a missing required field,
    // not a reason to store the claim at a lower weight — a number nobody can
    // reproduce is indistinguishable from one somebody invented.
    const signed = publishAs(peer, ['aa']);
    const m = (signed.content as unknown as { method: Record<string, unknown> }).method;
    m.parameters = { ...(m.parameters as object), matchedBy: 'enumeration' };
    const resigned = signFinding(signed.content, peer.secretKey);

    const result = store.accept(resigned);

    // The signature is VALID. That is the point: authenticity is not conformance.
    expect(result).toEqual({ accepted: false, reason: 'missing-required-fields' });
    expect(store.all()).toHaveLength(0);
  });

  it('rejects an enumeration whose set commitment is malformed', () => {
    // The commitment is optional and a malformed one is not tolerable: a
    // reader comparing their own digest against a value that cannot match
    // anything concludes their data differs, which is worse than no
    // commitment at all.
    const signed = publishAs(peer, ['aa']);
    const m = (signed.content as unknown as { method: Record<string, unknown> }).method;
    m.parameters = { ...(m.parameters as object), matchedBy: 'enumeration' };
    m.enumeratedBoundary = 'Companies House full register, snapshot 2026-08-01';
    m.enumeratedSetDigest = 'not-a-digest';

    expect(store.accept(signFinding(signed.content, peer.secretKey)))
      .toEqual({ accepted: false, reason: 'malformed' });
  });

  it('accepts an enumeration carrying a well-formed set commitment', () => {
    const signed = publishAs(peer, ['aa']);
    const m = (signed.content as unknown as { method: Record<string, unknown> }).method;
    m.parameters = { ...(m.parameters as object), matchedBy: 'enumeration' };
    m.enumeratedBoundary = 'Companies House full register, snapshot 2026-08-01';
    m.enumeratedSetDigest = 'a'.repeat(64);

    expect(store.accept(signFinding(signed.content, peer.secretKey)).accepted).toBe(true);
  });

  it('accepts an enumeration that states its boundary', () => {
    const signed = publishAs(peer, ['aa']);
    const m = (signed.content as unknown as { method: Record<string, unknown> }).method;
    m.parameters = { ...(m.parameters as object), matchedBy: 'enumeration' };
    m.enumeratedBoundary = 'Companies House full register, snapshot 2026-08-01';

    expect(store.accept(signFinding(signed.content, peer.secretKey)).accepted).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(store.accept(null).reason).toBe('malformed');
    expect(store.accept({ content: {} }).reason).toBe('malformed');
  });

  it('rejects v1 findings, which carry a declared confidence', () => {
    const v1 = signFinding({ schemaVersion: 1, claim: { entityRef: 'X', attribute: 'location', value: {} }, confidence: 0.9, corroboration: { sourceCount: 2, algorithmVersion: 1, criteria: 'x' }, publishedAt: NOW().toISOString() } as never, peer.secretKey);
    expect(store.accept(v1).reason).toBe('unsupported-schema');
  });

  it('ignores our own publications echoing back from relays', () => {
    const own = ml_dsa65.keygen();
    const ownHex = Buffer.from(ml_dsa65.getPublicKey(own.secretKey)).toString('hex');

    /**
     * Registered the way PUBLISHING registers it, not handed in as a fixture.
     *
     * The old version built an ML-DSA key and passed it as the store's
     * ownPubkey argument — internally consistent, and testing nothing, because
     * production threaded the NOSTR identity into that argument instead: 64
     * characters of secp256k1 against a 3904-character signature key. The check
     * could never fire, and this test could never notice, because it supplied
     * the very thing production got wrong.
     */
    ownPublishingKeys.reset();
    ownPublishingKeys.remember(ownHex);
    const s = new ForeignFindingStore();

    // Otherwise an instance corroborates itself.
    expect(s.accept(publishAs(own, ['aa'])).reason).toBe('own-publication');
    ownPublishingKeys.reset();
  });

  it('does NOT mistake a Nostr-length key for our ML-DSA publishing key', () => {
    const own = ml_dsa65.keygen();
    ownPublishingKeys.reset();
    // What production used to supply: a 64-char secp256k1 identity. It is not
    // the key anything is signed with, so it must not make our own echo look
    // foreign OR make a stranger look like us.
    ownPublishingKeys.remember('f'.repeat(64));
    const s = new ForeignFindingStore();

    expect(s.accept(publishAs(own, ['aa'])).reason).not.toBe('own-publication');
    ownPublishingKeys.reset();
  });

  it('counts rejections rather than swallowing them', () => {
    store.accept(null);
    store.accept(null);
    // A peer whose findings never verify is a fact an operator should see;
    // silent rejection makes a hostile relay look like a quiet one.
    expect(store.rejectionCounts().malformed).toBe(2);
  });

  it('keeps findings from different instances about the same subject', () => {
    const other = ml_dsa65.keygen();
    store.accept(publishAs(peer, ['aa']));
    store.accept(publishAs(other, ['bb']));

    expect(store.all()).toHaveLength(2);
    expect(store.knownAuthors()).toHaveLength(2);
  });

  it('drops a finding when its author retracts it', () => {
    store.accept(publishAs(peer, ['aa']));
    expect(store.all()).toHaveLength(1);

    const retraction = signFinding(
      buildRetraction({ subjectRef: 'Acme Corp', attribute: 'location' }, 'error', undefined, NOW) as never,
      peer.secretKey,
    );
    expect(store.accept(retraction).accepted).toBe(true);

    // Keeping it "for reference" would mean acting on something its author has
    // disowned.
    expect(store.all()).toHaveLength(0);
  });
});

describe('independence — agreement is only informative if the evidence differs', () => {
  const foreign = (fingerprints: string[]): ForeignFinding => ({
    authorPubkey: 'peer',
    slot: 'starcom_finding_acme_corp_location',
    content: buildFindingAttestation(finding(fingerprints), { modality: 'inference', weakBacking: [],
      subjectKind: 'organization', timePrecisionMs: 86_400_000, inputFingerprints: fingerprints,
    }, NOW),
    receivedAt: NOW().toISOString(),
  });

  it('calls it independent when none of their evidence is ours', () => {
    const a = assessForeignFinding(foreign(['xx', 'yy']), ['aa', 'bb'], NOW());
    expect(a.independence).toBe('independent');
    expect(a.corroborationValue).toBe(a.weight);
  });

  it('calls it an echo when we already hold all of their evidence', () => {
    // Two instances ingesting the same UCDP release and reaching the same
    // conclusion is one piece of evidence counted twice, not corroboration.
    const a = assessForeignFinding(foreign(['aa', 'bb']), ['aa', 'bb', 'cc'], NOW());
    expect(a.independence).toBe('echo');
    expect(a.corroborationValue).toBe(0);
  });

  it('discounts partial overlap proportionally', () => {
    const a = assessForeignFinding(foreign(['aa', 'xx']), ['aa', 'bb'], NOW());
    expect(a.independence).toBe('partial-overlap');
    expect(a.corroborationValue).toBeGreaterThan(0);
    expect(a.corroborationValue).toBeLessThan(a.weight);
  });

  it('treats unassessable independence conservatively, not optimistically', () => {
    // Rewarding an instance that publishes nothing checkable would make
    // opacity the winning strategy.
    const noFingerprints = assessForeignFinding(foreign([]), ['aa'], NOW());
    expect(noFingerprints.independence).toBe('unknown');
    expect(noFingerprints.corroborationValue).toBeLessThan(noFingerprints.weight);
  });

  it('derives their weight rather than reading it', () => {
    const a = assessForeignFinding(foreign(['xx']), ['aa'], NOW());
    expect(a.weight).toBeGreaterThan(0);
    // Nothing on the wire to read: v2 publishes no confidence at all.
    expect(foreign(['xx']).content).not.toHaveProperty('confidence');
  });

  it('gives a well-signed echo no more value than a weak one', () => {
    const strong = assessForeignFinding(foreign(['aa']), ['aa'], NOW());
    expect(strong.corroborationValue).toBe(0);
  });
});
