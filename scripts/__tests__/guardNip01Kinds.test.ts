/**
 * The NIP-01 kind guard has to be able to notice it read nothing.
 *
 * Both of its "cannot check" branches printed SKIP and exited 0, so renaming or
 * restructuring docs/spec/nip-draft-attested-claims.md made it pass forever
 * having read no kind table at all.
 *
 * That matters more here than in most guards: this is the only check that reads
 * the STANDARD rather than checking this repository's implementations against
 * each other, and the guard's own header records that four implementations
 * agreeing with one another is exactly what let the original kind collision
 * through. It is also written to be standalone and copyable by other peers, so
 * a silent-skip bug propagates to anyone who adopts it.
 *
 * And it is the precise failure guardHarness.ts was built for: "a guard shipped
 * here that printed 'skipping' and exited 0". It was still live in this one.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const SPEC = 'docs/spec/nip-draft-attested-claims.md';

/**
 * A minimal spec in the REAL table shape: | Kind | Type | Name |, kind
 * backticked, retention in column two.
 *
 * My first attempt used | Kind | Name | Notes | with the retention third. The
 * guard then read the NAME as the declared retention, found it in no synonym
 * list, printed "not recognised, skipped" and passed — so the test that was
 * supposed to prove a valid spec passes proved nothing at all, and only the
 * deliberately-invalid case failing gave it away. Asserting the checked count
 * below is what stops that recurring.
 */
const specWith = (rows: string) => `# Draft

## Kinds

| Kind | Type | Name |
|---|---|---|
${rows}
`;

describe('guard-nip01-kinds', () => {
  it('passes on a spec whose kinds sit in valid NIP-01 ranges', () => {
    const run = runGuardIn('guard-nip01-kinds.mjs', {
      [SPEC]: specWith('| `30082` | parameterized replaceable | Attested Claim |\n| `30083` | addressable | Refutation |'),
    });
    expect(run.status).toBe(0);
    // It must have READ them. Without this the suite passes when the parser
    // silently matches nothing, which is how the vacuous version looked.
    expect(run.output).toMatch(/2 declared kind\(s\)/);
  });

  it('FAILS when the spec it exists to read is not there', () => {
    // Previously: "SKIP — not found", exit 0. Rename the spec and the guard
    // approves of everything, forever.
    const run = runGuardIn('guard-nip01-kinds.mjs', { 'README.md': '# nothing here' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/MISSING|not found/i);
  });

  it('FAILS when the spec is present but no kind table can be parsed', () => {
    // The subtler half: the file is there, so nothing looks wrong, and the
    // guard reads zero rows and reports success.
    const run = runGuardIn('guard-nip01-kinds.mjs', {
      [SPEC]: '# Draft\n\nProse only. The table was restructured away.\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/NO TABLE|could not be parsed/i);
  });

  it('still catches a kind outside the addressable range', () => {
    // The rule the guard is actually for, asserted so that making the skips
    // fail cannot quietly become the only thing it does.
    const run = runGuardIn('guard-nip01-kinds.mjs', {
      // Kind 42 is a regular event by NIP-01's ranges, so declaring it
      // addressable is a claim a relay will not honour. "A document cannot opt
      // out of the range" is the guard's own wording.
      [SPEC]: specWith('| `42` | addressable | Attested Claim |'),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/MISMATCH/);
  });
});
