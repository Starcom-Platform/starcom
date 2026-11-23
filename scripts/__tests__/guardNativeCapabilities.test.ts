/**
 * The guard that failed open, and the proof it no longer does.
 *
 * This one printed "skipping — nothing to compare against" and exited 0
 * whenever the desktop submodule was absent. CI does not check out submodules
 * and the repository is private, so in the one environment it most needed to
 * work it would have been green forever while verifying nothing — which is the
 * exact defect it was written to catch, one level up.
 *
 * These fixtures are the reason to believe the repair.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-native-capabilities.mjs';

const zones = (caps: string[]) => `
export const APP_CAPABILITIES = [
${caps.map((c) => `  '${c}',`).join('\n')}
] as const;
`;

const GITMODULES = '[submodule "desktop"]\n\tpath = desktop\n\turl = https://example.invalid/x.git\n';

describe('guard-native-capabilities', () => {
  it('passes when every declared capability has a consumer', () => {
    const run = runGuardIn(GUARD, {
      '.gitmodules': GITMODULES,
      'desktop/src/main/security/zones.ts': zones(['net.fetch']),
      'src/uses.ts': 'const r = host.fetch({ url: "x" });\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when a capability is built and called by nothing', () => {
    const run = runGuardIn(GUARD, {
      '.gitmodules': GITMODULES,
      'desktop/src/main/security/zones.ts': zones(['net.fetch']),
      'src/uses.ts': '// calls nothing\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/called by nothing|does not exist/i);
  });

  it('FAILS rather than skipping when the submodule is absent — the original bug', () => {
    const run = runGuardIn(GUARD, {
      // .gitmodules declares a submodule; zones.ts is not checked out. This is
      // precisely the deploy container's state, where it used to exit 0.
      '.gitmodules': GITMODULES,
      'src/uses.ts': '// anything\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/cannot verify|green build starts lying/i);
  });

  it('passes quietly when no submodule is declared, since nothing claims one', () => {
    const run = runGuardIn(GUARD, { 'src/uses.ts': '// anything\n' });
    expect(run.status).toBe(0);
  });

  it('the escape hatch passes, and says out loud that it checked nothing', () => {
    const files = { '.gitmodules': GITMODULES, 'src/uses.ts': '' };

    expect(runGuardIn(GUARD, files).status).toBe(1);

    // vercel.json sets this, because the private submodule genuinely cannot be
    // fetched there. It must pass — and must not pretend it verified anything.
    const allowed = runGuardIn(GUARD, files, { ALLOW_UNCHECKED_NATIVE_CAPABILITIES: '1' });
    expect(allowed.status).toBe(0);
    expect(allowed.output).toMatch(/WITHOUT CHECKING ANYTHING/i);
  });
});
