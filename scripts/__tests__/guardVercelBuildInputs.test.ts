/**
 * The guard that stops the deploy dying on a missing build script.
 *
 * It exists because .vercelignore excluded eleven of the nineteen files the
 * build chain ran, and the deploy died on the first one. The file already
 * carried a note asking people to add each new build step to an allowlist by
 * hand; that note was followed zero times out of eleven.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn, packageJson } from './guardHarness';

const GUARD = 'guard-vercel-build-inputs.mjs';

describe('guard-vercel-build-inputs', () => {
  it('passes when every build step survives .vercelignore', () => {
    const run = runGuardIn(GUARD, {
      'package.json': packageJson({ build: 'node scripts/thing.mjs && vite build' }),
      '.vercelignore': '/scripts/*\n!/scripts/*.mjs\n',
      'scripts/thing.mjs': '// present\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when a build step is excluded — the case that broke the deploy', () => {
    const run = runGuardIn(GUARD, {
      'package.json': packageJson({ build: 'node scripts/thing.mjs && vite build' }),
      // Excluded and never re-included: exactly the shape that shipped.
      '.vercelignore': '/scripts/*\n',
      'scripts/thing.mjs': '// present but stripped from the container\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/EXCLUDED by \.vercelignore/i);
    expect(run.output).toMatch(/scripts\/thing\.mjs/);
  });

  it('FAILS when a build step is named and does not exist', () => {
    const run = runGuardIn(GUARD, {
      'package.json': packageJson({ build: 'node scripts/absent.mjs' }),
      '.vercelignore': '!/scripts/*.mjs\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/not present in the repository/i);
  });

  it('passes when there is no .vercelignore, since nothing can be excluded', () => {
    const run = runGuardIn(GUARD, {
      'package.json': packageJson({ build: 'node scripts/thing.mjs' }),
      'scripts/thing.mjs': '',
    });
    expect(run.status).toBe(0);
  });

  it('checks build:vercel too, not only build', () => {
    const run = runGuardIn(GUARD, {
      'package.json': packageJson({
        build: 'vite build',
        'build:vercel': 'node scripts/only-here.mjs && vite build',
      }),
      '.vercelignore': '/scripts/*\n',
      'scripts/only-here.mjs': '',
    });
    // A step that runs only in the deploy chain is the one most likely to be
    // forgotten, and the least likely to be noticed locally.
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/only-here\.mjs/);
  });
});
