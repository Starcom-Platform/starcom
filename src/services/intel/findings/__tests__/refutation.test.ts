import { describe, it, expect } from 'vitest';
import { buildRefutation, contestedState, REFUTATION_KIND } from '../refutation';
import { deriveAttestationWeight } from '../deriveAttestationWeight';
import type { AttestationMethod } from '../attestation';

const NOW = () => new Date('2026-08-20T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const method = (sourceCount: number): AttestationMethod => ({
  algorithm: 'location-corroboration',
  algorithmVersion: 1,
  parameters: { windowHours: 24, distanceThresholdKm: 100 },
  sourceCount,
  observedFrom: '2026-08-19T22:00:00.000Z',
  observedTo: '2026-08-19T23:00:00.000Z',
  timePrecisionMs: DAY,
  criteria: 'test',
});

const target = {
  subjectRef: 'Acme Corp',
  attribute: 'location',
  authorPubkey: 'abc123',
  publishedAt: '2026-08-19T12:00:00.000Z',
};

/**
 * Corroboration without refutation is agreement-counting. Contradiction
 * detection is internal only — an instance can notice its OWN observations
 * disagree, and has no way to say so about anyone else's published claim.
 */
describe('refutation is an attestation, not an assertion', () => {
  it('carries its own method, so it can be weighed rather than merely heard', () => {
    const r = buildRefutation(target, 'contradicting-evidence', method(3), NOW);
    // Without this, the cheapest possible message ("wrong") would outweigh
    // expensive evidence.
    expect(r.method.sourceCount).toBe(3);
    expect(deriveAttestationWeight(r, { now: NOW() })).toBeGreaterThan(0);
  });

  it('identifies WHICH instance it refutes, not just the subject', () => {
    // Two instances can publish about the same subject and attribute.
    const r = buildRefutation(target, 'failed-reproduction', method(2), NOW);
    expect(r.refutes.authorPubkey).toBe('abc123');
  });

  it('pins the specific claim it refutes by publication time', () => {
    // Otherwise it would silently apply to every later revision — including one
    // that fixed the very problem being refuted.
    const r = buildRefutation(target, 'error' as never, method(2), NOW);
    expect(r.refutes.publishedAt).toBe('2026-08-19T12:00:00.000Z');
  });

  it('separates "you were wrong" from "this is no longer true"', () => {
    expect(buildRefutation(target, 'contradicting-evidence', method(2), NOW).ground).toBe('contradicting-evidence');
    // Not an accusation of error.
    expect(buildRefutation(target, 'superseded-by-time', method(2), NOW).ground).toBe('superseded-by-time');
  });

  it('uses its own event kind, distinct from findings', () => {
    // Publishing into the finding's own slot would let anyone overwrite
    // anyone's claim, which is the opposite of checkability.
    expect(REFUTATION_KIND).toBe(30083);
    expect(REFUTATION_KIND).not.toBe(30082);
  });
});

describe('contested state weighs evidence, never counts it', () => {
  it('is uncontested with no refutations', () => {
    expect(contestedState(0.6, [])).toBe('uncontested');
  });

  it('is contested when a refutation exists but does not clearly outweigh', () => {
    expect(contestedState(0.6, [0.5])).toBe('contested');
    expect(contestedState(0.6, [0.7])).toBe('contested');
  });

  it('is refuted only on a decisive margin', () => {
    // Overturning a published claim should require clearly better evidence,
    // not marginally better.
    expect(contestedState(0.4, [0.9])).toBe('refuted');
  });

  it('lets one well-evidenced refutation outweigh ten empty ones', () => {
    const manyWeak = contestedState(0.5, [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]);
    const oneStrong = contestedState(0.5, [0.95]);

    // Counting would make refutation a voting system, and a voting system on an
    // open network is won by whoever runs the most instances.
    expect(manyWeak).toBe('contested');
    expect(oneStrong).toBe('refuted');
  });

  it('never reports a refuted claim as absent', () => {
    // 'refuted' is not 'deleted'. Disagreement stays legible; the loudest party
    // does not get to quietly amend the record.
    const states = ['uncontested', 'contested', 'refuted'];
    expect(states).toContain(contestedState(0.4, [0.9]));
  });
});
