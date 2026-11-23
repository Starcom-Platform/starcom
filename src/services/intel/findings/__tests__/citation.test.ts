/**
 * A Finding must say which events it rests on, in a TAG.
 *
 * This is Navcom's obligation 5 — "carry the source event ids into every
 * derived Finding, so a third party can walk it back without asking either of
 * us" — which I had reported as done when only the carrier field existed. The
 * ids stopped at the Observation: corroboration discarded them, and a
 * published Finding carried d, t and schema_version and nothing else.
 *
 * It is also the reciprocity mechanism. With these tags an operator answers
 * "which findings rest on what I filed?" with one relay filter,
 * `{kinds:[30082], "#e":[...ids they already know]}`. Buried in content it
 * would mean fetching every finding Starcom has published and parsing each.
 *
 * The property that makes it safe: the reference is to an EVENT, not a key. No
 * store of anybody's history is needed by either side, which is why it delivers
 * the reward that per-key standing would have, without building the profile
 * that made both sides decline standing.
 */
import { describe, it, expect } from 'vitest';
import { buildFindingAttestation } from '../FindingContent';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const EVENT_A = 'a'.repeat(64);
const EVENT_B = 'b'.repeat(64);

const finding = (over: Partial<CorroboratedFinding> = {}): CorroboratedFinding => ({
  entityRef: 'somewhere',
  attribute: 'access',
  value: 'fenced',
  confidence: 0.4,
  sourceCount: 2,
  observedFrom: '2026-09-01T00:00:00.000Z',
  observedTo: '2026-09-02T00:00:00.000Z',
  subjectKind: 'place',
  timePrecisionMs: 86_400_000,
  contributingFingerprints: [],
  citedEventIds: [EVENT_A, EVENT_B],
  matchedBy: 'equality',
  algorithmVersion: 1,
  ...over,
} as CorroboratedFinding);

const attest = (f: CorroboratedFinding) =>
  buildFindingAttestation(f, { modality: 'reported', weakBacking: [] });

describe('a Finding cites the events it rests on', () => {
  it('carries the ids taken from the finding, not from the caller', () => {
    // From the finding, because corroboration is what knows which events
    // survived into it. A caller supplying them would be asserting a
    // derivation it did not perform.
    expect(attest(finding()).method.citedEventIds).toEqual([EVENT_A, EVENT_B]);
  });

  it('omits the field rather than publishing an empty array', () => {
    // An empty array claims "this rests on no fetchable evidence", which is a
    // different and false statement from "none of these sources publish
    // events" — true of every open-data source we have.
    expect(attest(finding({ citedEventIds: [] })).method.citedEventIds).toBeUndefined();
  });

  it('carries no identities — ids are hashes, pubkeys are people', () => {
    const method = attest(finding()).method;
    const serialised = JSON.stringify(method);
    // The rule this field had to be reconciled with is that a Finding never
    // carries source identities. An event id resolves to a public event; a
    // pubkey resolves to a person. Only the first belongs here.
    for (const id of method.citedEventIds ?? []) {
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(serialised).not.toMatch(/npub1/);
    expect(method).not.toHaveProperty('citedPubkeys');
    expect(method).not.toHaveProperty('callsigns');
  });

  it('keeps citations distinct from fingerprints, which cannot be walked back', () => {
    const method = attest(finding()).method;
    // inputFingerprints prove a reader looked at the same inputs; they are
    // one-way. Conflating the two would make an unfetchable hash look like a
    // reference.
    expect(method.citedEventIds).toBeDefined();
    expect(method.inputFingerprints).toBeUndefined();
  });
});
