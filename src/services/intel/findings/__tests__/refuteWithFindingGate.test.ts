/**
 * The provenance gate on the refutation path.
 *
 * publishRefutation refuses unless the evidence STATES whether it is real, and
 * refuteWithFinding is the only entry point a person can reach. Passing the
 * caller's policy through untouched left that unstated, so every refutation was
 * refused — the button was wired, typechecked, covered by a test that mocked
 * this very function, and could never succeed.
 *
 * Both directions are asserted here, because they fail opposite ways: real
 * evidence must get THROUGH, and demo evidence must not, even when the caller
 * insists otherwise. A gate that only refuses is as broken as one that only
 * admits — the first silences disagreement, the second signs fabrications with
 * the real key.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

/**
 * The GATE is mocked, not the publisher.
 *
 * refuteWithFinding calls publishRefutation in-module, so mocking this module
 * from outside replaces nothing the function actually reaches. Asserting on
 * what evaluatePublication RECEIVES tests the seam that decides.
 */
const { evaluatePublication } = vi.hoisted(() => ({ evaluatePublication: vi.fn() }));
vi.mock('../publicationPolicy', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  evaluatePublication,
}));

const REFUTES = {
  subjectRef: 'Example Org',
  attribute: 'headquarters',
  authorPubkey: 'a'.repeat(64),
  publishedAt: '2026-08-17T00:00:00.000Z',
};

function evidence(isMock: boolean): CorroboratedFinding {
  return {
    entityRef: REFUTES.subjectRef,
    attribute: REFUTES.attribute,
    value: { lat: 51.5, lon: -0.12 },
    confidence: 0.9,
    sourceCount: 4,
    algorithmVersion: 2,
    isMock,
  } as CorroboratedFinding;
}

describe('refuteWithFinding — the provenance gate', () => {
  beforeEach(() => {
    // Refused, so nothing broadcasts — the assertion is on what the gate was told.
    evaluatePublication.mockReset().mockReturnValue({ allowed: false, reason: 'stopped in test' });
  });

  it('lets REAL evidence through, rather than refusing every refutation', async () => {
    const { refuteWithFinding } = await import('../FindingsPublisherService');
    await refuteWithFinding(REFUTES, 'contradicting-evidence', evidence(false), 'organization');

    // The gate refuses on `isMock !== false`, so an unstated value is a refusal.
    expect(evaluatePublication.mock.calls[0]?.[1]?.isMock).toBe(false);
  });

  it('refuses DEMO evidence even when the caller says the publication is real', async () => {
    const { refuteWithFinding } = await import('../FindingsPublisherService');
    await refuteWithFinding(REFUTES, 'contradicting-evidence', evidence(true), 'organization', {
      isMock: false,
    });

    // The evidence answers for itself. Otherwise a caller could sign a
    // refutation built from fabricated data with the real publishing key.
    expect(evaluatePublication.mock.calls[0]?.[1]?.isMock).toBe(true);
  });
});
