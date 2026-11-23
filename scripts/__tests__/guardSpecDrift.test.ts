/**
 * The format this node enforces and the format it publishes must be one thing.
 *
 * REQUIRED_FIELDS in ForeignFindingStore decides what this node REFUSES from a
 * peer. The specification documents tell other implementations what to send. If
 * a field is added to the first and not the second, every conforming peer is
 * rejected for omitting something nobody told them about — which is not a
 * specification, it is a trap.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-spec-drift.mjs';

const store = (fields: string[]) => `
const REQUIRED_FIELDS = [
${fields.map((f) => `  '${f}',`).join('\n')}
] as const;
`;

const spec = (fields: string[]) => `# Spec\n\n${fields.map((f) => `- \`${f}\` is required.`).join('\n')}\n`;

function repo(enforced: string[], documented: string[]) {
  return {
    'src/services/intel/federation/ForeignFindingStore.ts': store(enforced),
    'docs/spec/starcom-navcom-interchange.spec.md': spec(documented),
    'docs/spec/nip-draft-attested-claims.md': spec(documented),
  };
}

describe('guard-spec-drift', () => {
  it('passes when every enforced field is documented in both specs', () => {
    const run = runGuardIn(GUARD, repo(['claim.subjectRef', 'method.modality'], ['claim.subjectRef', 'method.modality']));
    expect(run.status).toBe(0);
  });

  it('FAILS when a field is enforced and documented nowhere', () => {
    // Adding a requirement without publishing it rejects every peer that
    // followed the spec they were given.
    const run = runGuardIn(GUARD, repo(['claim.subjectRef', 'method.newThing'], ['claim.subjectRef']));
    expect(run.status).toBe(1);
    // Reported by leaf name — the guard strips the object path, so `method.x`
    // surfaces as `x`. Asserting the dotted form passes on a guard that found
    // nothing, which is how a test comes to agree with a broken check.
    expect(run.output).toMatch(/does not mention: newThing/);
  });

  it('FAILS when a field is documented in one spec and missing from the other', () => {
    const run = runGuardIn(GUARD, {
      'src/services/intel/federation/ForeignFindingStore.ts': store(['claim.subjectRef', 'method.modality']),
      'docs/spec/starcom-navcom-interchange.spec.md': spec(['claim.subjectRef', 'method.modality']),
      'docs/spec/nip-draft-attested-claims.md': spec(['claim.subjectRef']),
    });
    expect(run.status).toBe(1);
  });
});
