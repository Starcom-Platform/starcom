import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Tests the GUARD, not the code it guards.
 *
 * A guard script that passes because its rules never match anything provides
 * false assurance — which is precisely the failure mode the guard exists to
 * prevent, turned on itself. These assert that it still detects the shape of
 * the bug it was written for.
 */

const repoRoot = path.resolve(__dirname, '../..');
const script = 'scripts/guard-capability-honesty.mjs';

function runGuard(root?: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...(root ? { GUARD_ROOT: root } : {}) },
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('guard-capability-honesty', () => {
  it('fails on a module that fabricates security status', () => {
    const { code, out } = runGuard('scripts/__fixtures__/capability-honesty/violating/src');

    expect(code).toBe(1);
    expect(out).toContain('opsec-no-fabricated-status');
    // The specific fabrications from the real bug.
    expect(out).toContain('getMockConnectionStatus');
    expect(out).toContain('isSecure: true');
    expect(out).toContain('fingerprintProtection: true');
  });

  it('passes on the corrected, fail-closed module', () => {
    const { code } = runGuard('scripts/__fixtures__/capability-honesty/compliant/src');
    expect(code).toBe(0);
  });

  it('tells the engineer what to do instead, not just that they failed', () => {
    const { out } = runGuard('scripts/__fixtures__/capability-honesty/violating/src');
    expect(out).toContain('instead');
    expect(out).toContain('verified:false');
  });

  it('reports a file and line for every violation', () => {
    const { out } = runGuard('scripts/__fixtures__/capability-honesty/violating/src');
    expect(out).toMatch(/opsecService\.ts:\d+/);
  });

  /**
   * Slow on purpose and generously timed.
   *
   * This case scans the ACTUAL src/ tree rather than a fixture, which is what
   * makes it worth having and also what makes it take seconds. Every other
   * guard test spawns its own node subprocess, so under vitest's file
   * parallelism this one competes with a dozen of them and overran a 5s default
   * — passing alone, failing in the suite. A guard suite that is flaky is worse
   * than no guard suite, because a red run stops meaning anything.
   */
  it('passes on the real source tree', () => {
    const { code, out } = runGuard();
    expect(code).toBe(0);
    expect(out).toContain('Capability-honesty guard passed');
  }, 60_000);
});
