/**
 * The first producer whose subject is COLLECTION rather than analysis.
 *
 * The queue's other three all watch work for somebody who already has an
 * investigation open. A collector — the role the network most needs and has
 * fewest of — had no queue at all, which is why nothing anywhere in the app
 * ever said "this was needed and is not here".
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { produceStaleRequirementItems } from '../staleRequirementProducer';
import type { CollectionRequirement } from '../../collection/collectionRequirement';

const NOW = new Date('2026-09-02T00:00:00.000Z');
const stages = (m: Record<string, string>) => (id: string) => m[id];

const req = (over: Partial<CollectionRequirement> = {}): CollectionRequirement => ({
  id: 'req-1',
  question: "Who are Acme's registered directors?",
  because: 'The mission cannot name a responsible party without it.',
  raisedBy: 'analyst',
  raisedAt: '2026-08-01T00:00:00.000Z',
  answeredBy: [],
  ...over,
});

const oneCase = (r: CollectionRequirement) => [{ id: 'case-1', title: 'Ownership of Acme', requirements: [r] }];

describe('produceStaleRequirementItems', () => {
  it('raises nothing for a requirement still within its usefulness', () => {
    const items = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2026-09-30T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    expect(items).toEqual([]);
  });

  it('raises nothing for a requirement with NO deadline', () => {
    // Absence of a date is not urgency. Treating it as urgency is how a queue
    // fills with everything anyone ever asked and stops being read.
    const items = produceStaleRequirementItems(
      { cases: oneCase(req()), reportStage: stages({}) }, () => NOW);
    expect(items).toEqual([]);
  });

  it('raises one when the answer has stopped serving the decision', () => {
    const items = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('requirement-went-stale');
    expect(items[0].caseId).toBe('case-1');
  });

  it('carries the justification, not just the question', () => {
    // `because` is required at raise-time precisely so this sentence can exist:
    // a collector choosing what to chase needs to know what turns on it.
    const items = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    expect(items[0].explanation).toMatch(/cannot name a responsible party/);
  });

  it('says when reports were offered but none counted as evidence', () => {
    const items = produceStaleRequirementItems({
      cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z', answeredBy: ['r1'] })),
      reportStage: stages({ r1: 'DRAFT' }),
    }, () => NOW);
    // A draft offered against a question is not an answer, and the difference
    // is exactly what a collector needs to see.
    expect(items[0].explanation).toMatch(/1 report\(s\) offered, none counting as evidence/);
  });

  it('does not raise one once real evidence answers it, however late', () => {
    const items = produceStaleRequirementItems({
      cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z', answeredBy: ['r1'] })),
      reportStage: stages({ r1: 'APPROVED' }),
    }, () => NOW);
    expect(items).toEqual([]);
  });

  it('keeps a stable id across recomputes as it ages', () => {
    const r = req({ staleAfter: '2026-08-15T00:00:00.000Z' });
    const a = produceStaleRequirementItems({ cases: oneCase(r), reportStage: stages({}) }, () => NOW);
    const later = produceStaleRequirementItems(
      { cases: oneCase(r), reportStage: stages({}) },
      () => new Date('2026-09-12T00:00:00.000Z'));
    // One concern however many times the queue recomputes. An id derived from
    // elapsed time would resurface it as new on every pass.
    expect(a[0].id).toBe(later[0].id);
    // And the ordering still carries information ten days on, rather than both
    // sitting at the ceiling — which is what the first rate did within a
    // fortnight, making a year-old requirement rank level with a recent one.
    expect(later[0].severity).toBeGreaterThan(a[0].severity);
  });

  it('keeps a CLAIMED requirement listed, at lower urgency', () => {
    const unclaimed = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    const claimed = produceStaleRequirementItems({
      cases: oneCase(req({
        staleAfter: '2026-08-15T00:00:00.000Z',
        claimedBy: { by: 'priya', at: '2026-08-20T00:00:00.000Z' },
      })),
      reportStage: stages({}),
    }, () => NOW);

    // Still listed: somebody said they were on it and it is STILL not answered.
    // Hiding it would let a claim nobody followed through on suppress the work,
    // which is the failure a claim-as-lock would cause by another route.
    expect(claimed).toHaveLength(1);
    expect(claimed[0].severity).toBeLessThan(unclaimed[0].severity);
    expect(claimed[0].explanation).toMatch(/priya said they were on it/);
  });

  it('never lets a stale requirement crowd out a contradiction', () => {
    const items = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2020-01-01T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    expect(items[0].severity).toBeLessThanOrEqual(0.85);
  });

  it('claims nothing it cannot know about the subject or its evidence', () => {
    const items = produceStaleRequirementItems(
      { cases: oneCase(req({ staleAfter: '2026-08-15T00:00:00.000Z' })), reportStage: stages({}) },
      () => NOW);
    // A question is not an entity, and an unanswered requirement has no
    // evidence to have provenance about.
    expect(items[0].subjectKind).toBe('unknown');
    expect(items[0].evidenceProvenance).toBe('unknown');
  });
});
