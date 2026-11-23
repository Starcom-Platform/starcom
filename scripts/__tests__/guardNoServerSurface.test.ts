/**
 * "This project runs no server by design" has to be enforced, not stated.
 *
 * The position matters: a server would hold operator credentials, become a
 * chokepoint, need funding, and be subpoenable — which is why Shodan and Censys
 * moved to bring-your-own-key instead of a proxy. A deploy configuration that
 * quietly starts serving functions undoes that without anyone editing a line of
 * doctrine.
 *
 * Cases here cover configuration only. The guard also probes live endpoints
 * when an api/ directory exists, and a unit test should not be reaching the
 * network to prove a point about JSON.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-no-server-surface.mjs';

const staticBuild = JSON.stringify({
  builds: [{ src: 'package.json', use: '@vercel/static-build', config: { distDir: 'dist' } }],
}, null, 2);

describe('guard-no-server-surface', () => {
  it('passes on an explicit static build with no functions', () => {
    expect(runGuardIn(GUARD, { 'vercel.json': staticBuild }).status).toBe(0);
  });

  it('FAILS with no explicit builds array, because Vercel would deploy api/ itself', () => {
    const run = runGuardIn(GUARD, { 'vercel.json': JSON.stringify({ headers: [] }) });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/no explicit `builds`/i);
  });

  it('FAILS on a functions block, which is server-side code by definition', () => {
    const run = runGuardIn(GUARD, {
      'vercel.json': JSON.stringify({
        builds: [{ src: 'package.json', use: '@vercel/static-build' }],
        functions: { 'api/thing.ts': { memory: 128 } },
      }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/functions/i);
  });

  it('FAILS when builds exist but none of them is static', () => {
    const run = runGuardIn(GUARD, {
      'vercel.json': JSON.stringify({ builds: [{ src: 'api/**', use: '@vercel/node' }] }),
    });
    expect(run.status).toBe(1);
  });

  it('FAILS when vercel.json is unreadable, rather than assuming the best', () => {
    // Unparseable config means the guard cannot confirm anything. Passing there
    // would be the failure-open shape this whole work package exists to remove.
    const run = runGuardIn(GUARD, { 'vercel.json': '{ not json' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/unreadable|cannot confirm/i);
  });
});
