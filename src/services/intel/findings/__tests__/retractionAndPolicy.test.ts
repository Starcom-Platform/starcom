import { describe, it, expect } from 'vitest';
import { buildRetraction, isRetraction } from '../retraction';
import { evaluatePublication } from '../publicationPolicy';
import { buildFindingAttestation } from '../FindingContent';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const NOW = () => new Date('2026-08-20T00:00:00Z');

const finding: CorroboratedFinding = {
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 1, lon: 2 },
  confidence: 0.8, sourceCount: 2,
  observedFrom: '2026-08-19T22:00:00.000Z', observedTo: '2026-08-19T23:00:00.000Z',
  algorithmVersion: 1,
};

/**
 * Without a withdrawal path, the first mistaken claim about a real person is
 * permanent and unanswerable. Retraction is the difference between a system
 * that can be wrong and one that cannot admit it.
 */
describe('retraction', () => {
  it('identifies the finding it withdraws by the same pair that forms the d tag', () => {
    const r = buildRetraction({ subjectRef: 'Acme Corp', attribute: 'location' }, 'error', undefined, NOW);
    // Publishing to the same d tag is what makes the withdrawal propagate
    // through the mechanism the finding used.
    expect(r.retracts).toEqual({ subjectRef: 'Acme Corp', attribute: 'location' });
    expect(r.retractedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('distinguishes a retraction from a claim at a glance', () => {
    const r = buildRetraction({ subjectRef: 'X', attribute: 'location' }, 'error', undefined, NOW);
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);

    expect(isRetraction(r)).toBe(true);
    expect(isRetraction(a)).toBe(false);
    // A consumer must be able to tell before it reads a claim.
    expect(r.retracted).toBe(true);
  });

  it('separates "wrong" from "stale" — they are different facts about a claim', () => {
    expect(buildRetraction({ subjectRef: 'X', attribute: 'location' }, 'error', undefined, NOW).reason).toBe('error');
    expect(buildRetraction({ subjectRef: 'X', attribute: 'location' }, 'superseded', undefined, NOW).reason).toBe('superseded');
  });

  it('supports withdrawal at the subject\'s request', () => {
    const r = buildRetraction({ subjectRef: 'A Person', attribute: 'location' }, 'subject-request', undefined, NOW);
    expect(r.reason).toBe('subject-request');
  });

  it('never requires a justification to withdraw', () => {
    // Withdrawing a wrong claim quickly matters more than explaining it well.
    const r = buildRetraction({ subjectRef: 'X', attribute: 'location' }, 'error', undefined, NOW);
    expect(r).not.toHaveProperty('note');
    expect(isRetraction(r)).toBe(true);
  });

  it('ignores malformed payloads rather than treating them as retractions', () => {
    expect(isRetraction(null)).toBe(false);
    expect(isRetraction({})).toBe(false);
    expect(isRetraction({ retracted: 'yes' })).toBe(false);
  });
});

/**
 * Publishing a claim about a person is a deliberate act, not a default. Not
 * because such findings are illegitimate — naming who did what is much of the
 * point — but because it should never happen because nobody thought about it.
 */
/** Known-real evidence. The policy refuses anything else, including unmeasured. */
const REAL = { isMock: false } as const;

describe('publication policy', () => {
  it('allows organisations, places and events without ceremony', () => {
    for (const kind of ['organization', 'place', 'event', 'object'] as const) {
      expect(evaluatePublication(kind, REAL).allowed).toBe(true);
    }
  });

  it('blocks a finding about a person by default', () => {
    const decision = evaluatePublication('person', REAL);
    expect(decision.allowed).toBe(false);
    expect(decision).toHaveProperty('requiresExplicitConsent', true);
  });

  it('explains what the operator is being asked to confirm', () => {
    const decision = evaluatePublication('person', REAL);
    // A gate that does not say why gets clicked through.
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toMatch(/person/i);
      expect(decision.reason).toMatch(/public relays/i);
    }
  });

  it('allows a person in a public role on explicit, per-finding consent', () => {
    // A legislator, a police officer, a corporate officer, a threat actor's
    // persona. Ordinarily publishable — consent keeps it deliberate.
    expect(evaluatePublication('person', {
      ...REAL, consentToPublishAboutPerson: true, subjectRole: 'public-office',
    }).allowed).toBe(true);
  });

  it('does NOT allow a private individual on consent alone', () => {
    // This assertion used to say the opposite, and a stress test of sixteen
    // investigator cases showed what that cost: on one checkbox the gate
    // published a whistleblower's identity, a target's child's home address, a
    // private donor, and a recruitment candidate.
    expect(evaluatePublication('person', {
      ...REAL, consentToPublishAboutPerson: true,
    }).allowed).toBe(false);
  });

  it('allows a private individual when a public interest is stated and recorded', () => {
    // No absolute bar — those get routed around. A question an editor asks out
    // loud does not.
    expect(evaluatePublication('person', {
      ...REAL,
      consentToPublishAboutPerson: true,
      publicInterestJustification: '214 unremedied housing-code violations, harm ongoing',
    }).allowed).toBe(true);
  });

  it('allows unknown subjects, deliberately', () => {
    // Blocking unknown would make the prompt routine, and a prompt that appears
    // constantly stops being deliberation and becomes a key people press.
    expect(evaluatePublication('unknown', REAL).allowed).toBe(true);
  });
});

describe('publication policy — fabricated evidence never reaches the wire', () => {
  it('refuses a finding built on mock data', () => {
    // Demo data is loaded in dev and demo mode and flows through the same
    // correlation engine as everything else. Without this gate a finding
    // derived entirely from it could be signed with the instance's real key
    // and broadcast to public relays as ordinary intelligence.
    const decision = evaluatePublication('organization', { isMock: true });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/fabricated evidence/);
  });

  it('refuses when provenance was never established', () => {
    // "Nobody said" is not permission. Allowing undefined would reopen the
    // hole for every event type that does not carry the flag yet.
    const decision = evaluatePublication('organization', {});
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/does not state whether it is real/);
  });

  it('offers no consent override for fabricated data', () => {
    // The person gate is a judgement an operator may legitimately make.
    // Publishing invented data as intelligence is not.
    expect(evaluatePublication('organization', {
      isMock: true, consentToPublishAboutPerson: true,
    }).allowed).toBe(false);
  });

  it('checks provenance BEFORE the person gate, so the stronger refusal wins', () => {
    const decision = evaluatePublication('person', { isMock: true, consentToPublishAboutPerson: true });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/fabricated/);
  });
});
