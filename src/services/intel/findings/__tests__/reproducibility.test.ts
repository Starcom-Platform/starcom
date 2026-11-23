import { describe, it, expect } from 'vitest';
import { observationFingerprint, fingerprintSet, attemptReproduction } from '../reproducibility';
import { buildFindingAttestation } from '../FindingContent';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const NOW = () => new Date('2026-08-20T00:00:00Z');
const obs = (subject: string, value: unknown, ts: string) => ({
  subjectEntityRef: subject, claim: { attribute: 'location', value }, timestamp: ts,
});

const finding: CorroboratedFinding = {
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 1, lon: 2 },
  confidence: 0.8, sourceCount: 2,
  observedFrom: '2026-08-19T22:00:00.000Z', observedTo: '2026-08-19T23:00:00.000Z',
  algorithmVersion: 1,
};

/**
 * "Falsifiable" is meaningless if nobody else can attempt the falsification.
 * Fingerprints let a third party ask the question that matters: do I hold the
 * same evidence?
 */
describe('observation fingerprints', () => {
  it('is stable for the same observation', () => {
    const a = obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z');
    expect(observationFingerprint(a)).toBe(observationFingerprint({ ...a }));
  });

  it('differs when any identifying fact differs', () => {
    const base = obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z');
    expect(observationFingerprint(base)).not.toBe(observationFingerprint(obs('Beta', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z')));
    expect(observationFingerprint(base)).not.toBe(observationFingerprint(obs('Acme', { lat: 9, lon: 2 }, '2026-08-19T22:00:00Z')));
    expect(observationFingerprint(base)).not.toBe(observationFingerprint(obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T23:00:00Z')));
  });

  it('matches across instances that ingested the same upstream event', () => {
    // Two instances assign their own observation ids. Including the id would
    // make identical evidence fingerprint differently — exactly backwards.
    const instanceA = obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z');
    const instanceB = obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z');
    expect(observationFingerprint(instanceA)).toBe(observationFingerprint(instanceB));
  });

  it('is sorted and deduplicated, so sets compare directly', () => {
    const a = obs('A', 1, '2026-08-19T22:00:00Z');
    const b = obs('B', 2, '2026-08-19T22:00:00Z');
    expect(fingerprintSet([b, a, a])).toEqual([...fingerprintSet([a, b])]);
    expect(fingerprintSet([a, a])).toHaveLength(1);
  });

  it('reveals no content', () => {
    const f = observationFingerprint(obs('Acme Corp', { lat: 51.5, lon: -0.12 }, '2026-08-19T22:00:00Z'));
    expect(f).toMatch(/^[0-9a-f]{32}$/);
    expect(f).not.toContain('Acme');
  });
});

describe('attempting reproduction', () => {
  const published = fingerprintSet([
    obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z'),
    obs('Acme', { lat: 1.1, lon: 2.1 }, '2026-08-19T23:00:00Z'),
  ]);

  it('reports full reproduction when the consumer holds all the evidence', () => {
    const r = attemptReproduction(published, published);
    expect(r.verdict).toBe('reproduced');
    expect(r.coverage).toBe(1);
  });

  it('reports partial coverage when the consumer holds some of it', () => {
    const r = attemptReproduction(published, [published[0]]);
    expect(r.verdict).toBe('partial');
    expect(r.matched).toBe(1);
    expect(r.missing).toBe(1);
  });

  it('reports unreproducible — NOT false — when the consumer holds none', () => {
    // Holding no evidence is a fact about you, not about the claim. Treating it
    // as refutation would let any party with no data refute anything.
    const r = attemptReproduction(published, []);
    expect(r.verdict).toBe('unreproducible');
    expect(r.coverage).toBe(0);
  });
});

describe('the envelope on the wire', () => {
  it('omits fingerprints rather than publishing an empty set', () => {
    // An empty array would claim "this rests on no evidence" — a different and
    // false statement from "the evidence set was not published".
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);
    expect(a.method).not.toHaveProperty('inputFingerprints');
  });

  it('carries them when supplied', () => {
    const fps = fingerprintSet([obs('Acme', { lat: 1, lon: 2 }, '2026-08-19T22:00:00Z')]);
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [], inputFingerprints: fps }, NOW);
    expect(a.method.inputFingerprints).toEqual(fps);
  });
});
