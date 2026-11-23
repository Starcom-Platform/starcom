/**
 * A barrel import of @mui/icons-material pulls the whole set into the bundle.
 *
 * It is the kind of line that looks identical to the correct one in review and
 * costs megabytes in the artefact — invisible in source, obvious in a
 * bundle-size graph nobody is watching.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-icon-barrel-imports.mjs';

describe('guard-icon-barrel-imports', () => {
  it('passes on a deep import, which pulls only the icon asked for', () => {
    const run = runGuardIn(GUARD, {
      'src/a.tsx': "import Search from '@mui/icons-material/Search';\nexport default Search;\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on a barrel import', () => {
    const run = runGuardIn(GUARD, {
      'src/a.tsx': "import { Search } from '@mui/icons-material';\nexport default Search;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/a\.tsx/);
  });

  it('does not flag the string appearing outside an import', () => {
    // A guard that matched the package name anywhere would fail on its own
    // documentation, and on any comment explaining why the rule exists.
    const run = runGuardIn(GUARD, {
      'src/a.tsx': "// never import from '@mui/icons-material' directly\nexport const x = 1;\n",
    });
    expect(run.status).toBe(0);
  });
});
