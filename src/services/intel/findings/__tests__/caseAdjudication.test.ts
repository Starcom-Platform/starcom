/**
 * A case's position, published as an attested claim.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { attestationForCasePosition } from '../caseAdjudication';
import { deriveAttestationWeight } from '../deriveAttestationWeight';
import { CaseStatus, CasePriority } from '../../../../types/intel/IntelCaseUI';
import type { IntelCaseUI } from '../../../../types/intel/IntelCaseUI';

const NOW = () => new Date('2026-09-01T00:00:00.000Z');

function makeCase(over: Partial<IntelCaseUI> = {}): IntelCaseUI {
  return {
    id: 'case-1', caseNumber: 'C-042', title: 'Acme', description: '',
    status: CaseStatus.OPEN, priority: CasePriority.MEDIUM,
    assignedTo: [], startDate: '2026-08-01T00:00:00.000Z',
    relatedEntities: ['r1', 'r2', 'r3'],
    relatedCases: [], tags: [], metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'analyst', collaborators: [], comments: [], activityLog: [],
    position: {
      statement: 'Acme operated the shell network.',
      verdict: 'substantiated',
      adjudicatedBy: 'analyst',
      adjudicatedAt: '2026-09-01T00:00:00.000Z',
    },
    ...over,
  } as IntelCaseUI;
}

const OPTS = { subjectRef: 'Acme Corp', subjectKind: 'organization' as const };

describe('attestationForCasePosition', () => {
  it('publishes nothing for a case that has concluded nothing', () => {
    expect(attestationForCasePosition(makeCase({ position: undefined }), OPTS, NOW)).toBeNull();
  });

  it('carries the verdict as the claim value, and not the adjudicator prose', () => {
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    expect(a.claim.value).toBe('substantiated');
    expect(JSON.stringify(a)).not.toContain('shell network');
  });

  it('gives each case its own slot, so a second case cannot replace the first', () => {
    // Kind 30082 replaces on (author, subject, attribute). Two investigations
    // of one subject are two claims.
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    const b = attestationForCasePosition(makeCase({ caseNumber: 'C-043' }), OPTS, NOW)!;
    expect(a.claim.attribute).not.toBe(b.claim.attribute);
    // The literal, not the function that produced it. Asserting a builder
    // against itself is self-consistent whatever it emits, and this string is
    // wire-visible: it IS the replaceable slot other nodes address.
    expect(a.claim.attribute).toBe('case-adjudication:C-042');
  });

  it('names case-adjudication as its algorithm, at kind 30082 like any claim', () => {
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    expect(a.method.algorithm).toBe('case-adjudication');
    // Human judgement, drawn across records rather than witnessed.
    expect(a.method.modality).toBe('inference');
  });

  it('publishes no distance threshold, because nothing matched by distance', () => {
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    // A 0 here would read to a consumer as an extremely precise radius.
    expect(a.method.parameters).not.toHaveProperty('distanceThresholdKm');
  });

  it('counts only contradictions the adjudicator answered in writing', () => {
    const a = attestationForCasePosition(makeCase({
      contradictedBy: ['e1', 'e2', 'e3'],
      position: {
        statement: 'x', verdict: 'substantiated', adjudicatedBy: 'a',
        adjudicatedAt: '2026-09-01T00:00:00.000Z',
        addressed: { e1: 'the second sighting was 40km off' },
      },
    }), OPTS, NOW)!;
    expect(a.method.parameters.contradictionsTotal).toBe(3);
    expect(a.method.parameters.contradictionsAddressed).toBe(1);
  });

  it('says plainly when contradictions went unaddressed', () => {
    const a = attestationForCasePosition(makeCase({ contradictedBy: ['e1', 'e2'] }), OPTS, NOW)!;
    // A reader scanning weakBacking should not have to subtract two numbers.
    expect(a.method.weakBacking.join(' ')).toMatch(/2 of 2 linked contradictions were not addressed/);
  });

  it('admits when it does not know the observation window', () => {
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    expect(a.method.weakBacking.join(' ')).toMatch(/observation window unknown/);
  });

  it('says nothing about the window when it was given one', () => {
    const a = attestationForCasePosition(makeCase(), {
      ...OPTS, evidenceWindow: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z' },
    }, NOW)!;
    expect(a.method.weakBacking.join(' ')).not.toMatch(/observation window unknown/);
    expect(a.method.observedTo).toBe('2026-08-20T00:00:00.000Z');
  });

  it('flags a position that rests on nothing recorded', () => {
    const a = attestationForCasePosition(makeCase({ relatedEntities: [] }), OPTS, NOW)!;
    expect(a.method.sourceCount).toBe(0);
    expect(a.method.weakBacking.join(' ')).toMatch(/rests on nothing recorded/);
  });

  it('produces a weight a consumer can actually derive', () => {
    // The property that decides whether this is publishable at all: an
    // unweighable claim is refused on receipt by every conforming node.
    const a = attestationForCasePosition(makeCase(), OPTS, NOW)!;
    const w = deriveAttestationWeight(a, { now: new Date('2026-09-02T00:00:00.000Z') });
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBeGreaterThan(0);
  });

  it('weighs a thin case below a well-evidenced one', () => {
    const thin = attestationForCasePosition(makeCase({ relatedEntities: ['r1'] }), OPTS, NOW)!;
    const solid = attestationForCasePosition(
      makeCase({ relatedEntities: ['r1', 'r2', 'r3', 'r4', 'r5'] }), OPTS, NOW)!;
    const at = { now: new Date('2026-09-02T00:00:00.000Z') };
    expect(deriveAttestationWeight(solid, at)).toBeGreaterThan(deriveAttestationWeight(thin, at));
  });

  it('refuses an undateable case rather than publishing a claim no peer will store', () => {
    /**
     * Math.max cannot clamp NaN — Math.max(1, NaN) is NaN, not 1.
     *
     * So this published `windowHours: null` (JSON has no NaN), every consumer
     * derived nothing from it, and this repo's own validators rejected the
     * claim as underivable-weight at every peer — while the publisher reported
     * success and the interface said "Published". A claim no conforming node
     * will store is not published.
     */
    expect(() => attestationForCasePosition(
      makeCase({ startDate: 'not-a-date' }),
      { subjectRef: 'Acme', subjectKind: 'organization' },
    )).toThrow(/cannot be dated|no usable start date/i);
  });

  it('does not assert the adjudicator was human', () => {
    const a = attestationForCasePosition(makeCase(), { subjectRef: 'Acme', subjectKind: 'organization' });
    // The criteria describes the WORK — records read, contradictions
    // addressed, verdict reached. Who did it is not a property of the method
    // and cannot be verified by anyone receiving the claim.
    expect(a.method.criteria).not.toMatch(/\bhuman\b/i);
    expect(a.method.criteria).toMatch(/adjudicator reviewed/i);
  });

  it('still derives a usable weight for a same-day adjudication', () => {
    const a = attestationForCasePosition(
      makeCase({ startDate: '2026-09-01T00:00:00.000Z' }),
      { subjectRef: 'Acme', subjectKind: 'organization' },
    );
    // Floored at one hour rather than zero: deciding promptly must not make the
    // verdict underivable.
    expect(a.method.parameters.windowHours).toBe(1);
  });

  it('publishes the contradictions that were actually addressed', () => {
    /*
     * The reason the UI work existed. contradictionsAddressed is counted from
     * position.addressed, and CasesDashboard never passed one — so every
     * published adjudication told each peer that NO contradictions were
     * addressed, and the weakBacking line below said so in words.
     *
     * Both directions asserted, because a count that is right only when it is
     * zero is not a count.
     */
    const withAnswers = attestationForCasePosition(
      makeCase({
        contradictedBy: ['rpt-a', 'rpt-b'],
        position: {
          statement: 'Acme operated the shell network.',
          verdict: 'substantiated',
          adjudicatedBy: 'analyst',
          adjudicatedAt: '2026-09-01T00:00:00.000Z',
          addressed: { 'rpt-a': 'Source retracted its figure.' },
        },
      } as never),
      { subjectRef: 'Acme', subjectKind: 'organization' },
    );
    expect(withAnswers.method.parameters.contradictionsTotal).toBe(2);
    expect(withAnswers.method.parameters.contradictionsAddressed).toBe(1);
    expect(withAnswers.method.criteria).toMatch(/addressing 1 of them/);
    // One is still unanswered, so the disclosure must still say so.
    expect(withAnswers.method.weakBacking.join(' ')).toMatch(/1 of 2/);
  });

  it('still says nothing was addressed when nothing was', () => {
    const none = attestationForCasePosition(
      makeCase({ contradictedBy: ['rpt-a'] } as never),
      { subjectRef: 'Acme', subjectKind: 'organization' },
    );
    expect(none.method.parameters.contradictionsAddressed).toBe(0);
    expect(none.method.weakBacking.join(' ')).toMatch(/1 of 1/);
  });
});

/*
 * The evidence exit (decision D-EX, EX23): a published case position carries the SHA-256 of each evidence
 * file the case holds, so a reader holding the same files can confirm they match, without either side
 * revealing content or sources. A fingerprint confirms a guess, so a case marked careful or protected,
 * or not yet marked, publishes none, and says so.
 */
describe('evidence fingerprints in a published case position (EX23)', () => {
  const PRINTS = ['b'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)];

  it('carries the evidence files\' hashes, sorted and each once, when the case is open, and says where the files are', () => {
    const att = attestationForCasePosition(makeCase({ sensitivity: 'open' } as never), { ...OPTS, evidenceFingerprints: PRINTS }, NOW)!;
    expect(att.method.inputFingerprints).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(att.method.weakBacking.join(' ')).toMatch(/2 evidence file\(s\) fingerprinted, kept by the capturer/);
  });

  it('carries none from a case marked careful or protected, or not marked, and says why', () => {
    for (const sensitivity of ['careful', 'protected', undefined]) {
      const att = attestationForCasePosition(makeCase({ sensitivity } as never), { ...OPTS, evidenceFingerprints: PRINTS }, NOW)!;
      expect(att.method).not.toHaveProperty('inputFingerprints');
      expect(att.method.weakBacking.join(' ')).toMatch(/evidence not fingerprinted: the case is (marked careful|marked protected|not marked open)/);
    }
  });

  it('says nothing of fingerprints when no evidence was captured', () => {
    const att = attestationForCasePosition(makeCase({ sensitivity: 'open' } as never), OPTS, NOW)!;
    expect(att.method).not.toHaveProperty('inputFingerprints');
    expect(att.method.weakBacking.join(' ')).not.toMatch(/fingerprint/);
  });
});

/*
 * The Archive credited (decision D-EX, EX34): its terms ask that published research name it, so a case
 * position resting on a Wayback snapshot says so in its criteria, and one that does not, does not.
 */
describe('the Internet Archive credited in a published case position (EX34)', () => {
  it('names the Wayback Machine when the case rests on a snapshot', () => {
    const att = attestationForCasePosition(makeCase({ sensitivity: 'open' } as never), { ...OPTS, archiveCited: true }, NOW)!;
    expect(att.method.criteria).toMatch(/Some of its evidence is from the Internet Archive's Wayback Machine \(web\.archive\.org\)\./);
  });

  it('names no archive when none was used', () => {
    const att = attestationForCasePosition(makeCase({ sensitivity: 'open' } as never), OPTS, NOW)!;
    expect(att.method.criteria).not.toMatch(/Archive/);
  });
});
