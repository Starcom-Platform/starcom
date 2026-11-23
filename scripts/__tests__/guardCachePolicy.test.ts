/**
 * guard-cache-policy.mjs, on the built service worker: it must be stamped with
 * its build, or every build ships the same worker and the data it keeps is
 * never checked again (decided 2026-10-07: checked once per build).
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-cache-policy.mjs';

const VERCEL = JSON.stringify({
  headers: [
    { source: '/assets/(.*).js', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
  ],
});

const built = (worker: string) => ({
  'vercel.json': VERCEL,
  'dist/sw.js': worker,
  'dist/assets/index-AbCd1234.js': '',
});

describe('guard-cache-policy: the built service worker', () => {
  it('refuses a worker never stamped with its build', () => {
    const run = runGuardIn(GUARD, built("const BUILD = '__STARCOM_BUILD__';\n"));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/never stamped with its build/);
  });

  it('passes one stamped with its build', () => {
    const run = runGuardIn(GUARD, built("const BUILD = 'e95045ed649c@2026-10-07T03:21:04.000Z';\n"));
    expect(run.output).not.toMatch(/never stamped/);
    expect(run.status).toBe(0);
  });
});
