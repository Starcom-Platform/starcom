/**
 * An import that resolves locally and is absent from the repository.
 *
 * This is the defect that only ever breaks somebody else: the file is on the
 * author's disk, so every check they run passes, and the first clean clone dies
 * on it. Asking git what it tracks — rather than asking the filesystem what
 * exists — is the only way to see it from the machine that has the file.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-untracked-imports.mjs';

describe('guard-untracked-imports', () => {
  it('passes when every imported file is tracked', () => {
    const run = runGuardIn(GUARD, {
      'src/a.ts': "import { thing } from './b';\nthing();\n",
      'src/b.ts': 'export const thing = () => {};\n',
    }, {}, { gitTracked: ['src/a.ts', 'src/b.ts'] });
    expect(run.status).toBe(0);
  });

  it('FAILS when an import resolves to a file git does not have', () => {
    const run = runGuardIn(GUARD, {
      'src/a.ts': "import { thing } from './b';\nthing();\n",
      // Present on disk, never committed — passes locally, breaks every clone.
      'src/b.ts': 'export const thing = () => {};\n',
    }, {}, { gitTracked: ['src/a.ts'] });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/b/);
  });

  it('FAILS when a file imported with a Vite query (?url) is one git does not have', () => {
    // The query was read as part of the file name, so no file was found and the import was skipped.
    const run = runGuardIn(GUARD, {
      'src/a.ts': "import decoderUrl from './basis/decoder.js?url';\nexport default decoderUrl;\n",
      'src/basis/decoder.js': 'var DECODER = 1;\n',
    }, {}, { gitTracked: ['src/a.ts'] });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/decoder\.js/);
  });

  it('ignores package imports, which git is not expected to track', () => {
    const run = runGuardIn(GUARD, {
      'src/a.ts': "import React from 'react';\nexport default React;\n",
    }, {}, { gitTracked: ['src/a.ts'] });
    expect(run.status).toBe(0);
  });
});
