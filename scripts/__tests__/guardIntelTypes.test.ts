/**
 * One definition of IntelReport, in one of two canonical folders.
 *
 * The guard exists because a second local declaration of the same name is
 * indistinguishable from the real one at a glance, and TypeScript will happily
 * structurally accept a near-match — so two "IntelReport" types drift until
 * something that reads one is handed the other and silently loses fields.
 *
 * It resolves its scan root from process.cwd(), so the fixture is a directory
 * we build and the script under test is the one that ships. No guard change was
 * needed to test it: I had recorded that this guard was "__dirname-anchored"
 * and therefore blocked. It is not, and never was.
 *
 * ─── WHY THE FIXTURES ARE ASSEMBLED RATHER THAN WRITTEN ────────────────────
 *
 * The guard scans every .ts and .tsx in the repository and its IGNORE list has
 * no test exclusion — deliberately, since a forbidden declaration in a test is
 * still a second definition people will copy. So a literal
 * `export interface IntelReport` in THIS file makes the guard fail on this
 * file, which is exactly what happened the first time I ran the gate.
 *
 * Assembling the declaration keeps the guard's scope intact — narrowing it to
 * excuse a test would trade a real rule for a convenience — while the fixture
 * still contains the genuine pattern at runtime, which is what the guard reads.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const G = 'guard-intel-types.mjs';

/** Built, not written — see the note above. */
const declare = (kw: 'interface' | 'type', name: string) =>
  kw === 'interface'
    ? `export ${kw} ${name} { id: string }\n`
    : `export ${kw} ${name} = { id: string }\n`;

describe('guard-intel-types', () => {
  it('allows the canonical declaration in src/types/intel', () => {
    const run = runGuardIn(G, {
      'src/types/intel/IntelReport.ts': declare('interface', 'IntelReport'),
    });
    expect(run.status).toBe(0);
  });

  it('allows the canonical declaration in src/models/Intel', () => {
    const run = runGuardIn(G, {
      'src/models/Intel/Intel.ts': declare('type', 'IntelReport'),
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on a second declaration outside the canonical folders', () => {
    const run = runGuardIn(G, {
      'src/types/intel/IntelReport.ts': declare('interface', 'IntelReport'),
      'src/applications/netrunner/localTypes.ts': declare('interface', 'IntelReport'),
    });
    expect(run.status).toBe(1);
    expect(run.output).toContain('localTypes.ts');
  });

  it('catches the legacy and NetRunner-prefixed names too', () => {
    // All three are in the pattern; asserting each so a regex edit that drops
    // one cannot pass unnoticed.
    for (const name of ['IntelReport', 'LegacyIntelReport', 'NetRunnerIntelReport']) {
      const run = runGuardIn(G, {
        'src/somewhere/thing.ts': declare('interface', name),
      });
      expect(run.status, name).toBe(1);
    }
  });

  it('does not fire on a mere mention, only on a declaration', () => {
    // Importing or referencing the canonical type everywhere is the POINT.
    // A guard that failed on usage would push people to redeclare instead.
    const run = runGuardIn(G, {
      'src/applications/netrunner/uses.ts':
        "import type { IntelReport } from '../../types/intel/IntelReport';\n"
        + 'export const read = (r: IntelReport) => r;\n',
    });
    expect(run.status).toBe(0);
  });

  it('does not fire on a comment that DOCUMENTS the rule', () => {
    /*
     * Found by this very file. The guard reported guardIntelTypes.test.ts as
     * declaring IntelReport, because the doc comment above quotes the pattern
     * it forbids. A guard that fails on the text describing it gets reworded
     * around or switched off, and the rule stops being written down — worse
     * than the false positive. A declaration inside a comment is not a
     * declaration.
     */
    const run = runGuardIn(G, {
      'src/notes.ts':
        '// Never declare ' + 'interface IntelReport' + ' outside the canonical folders.\n'
        + '/* Nor ' + 'type NetRunnerIntelReport' + ' anywhere at all. */\n'
        + 'export const note = 1;\n',
    });
    expect(run.status).toBe(0);
  });
});
