/**
 * guard-undefined-css-vars: every `var(--name)` without a fallback names a
 * custom property something defines (critique audit of 2026-10-01; plan block
 * F, item 7).
 *
 * A `var()` that resolves to nothing makes its whole declaration invalid, and
 * the property falls back to its initial value with no error anywhere. The
 * bottom bar's `padding: var(--space-sm) 16px` was dropped entirely, its 16 px
 * sides with it, because the scale has --space-1 to --space-24 and no --space-sm;
 * IntelWeb's six --intel-* colours were never defined, so its header had no
 * background. Nine such names were in src/ when this was written.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-undefined-css-vars.mjs';
const run = (files: Record<string, string>) => runGuardIn(GUARD, files);
const TOKENS = { 'src/styles/base.css': ':root { --space-2: 0.5rem; }\n' };

describe('guard-undefined-css-vars', () => {
  it('fails on a var() naming a property nothing defines, saying where', () => {
    const r = run({ ...TOKENS, 'src/components/Bar.module.css': '.bar { padding: var(--space-sm) 16px; }\n' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/components\/Bar\.module\.css:1 {2}--space-sm/);
  });

  it('passes a name defined in any stylesheet', () => {
    expect(run({ ...TOKENS, 'src/components/Bar.module.css': '.bar { padding: var(--space-2); }\n' }).status).toBe(0);
  });

  it('passes a var() with a fallback: it says what to use when the name is missing', () => {
    expect(run({ ...TOKENS, 'src/components/Bar.module.css': '.bar { color: var(--not-here, #fff); }\n' }).status).toBe(0);
  });

  it('counts a property set from code, in a style object or with setProperty', () => {
    const r = run({
      ...TOKENS,
      'src/components/A.tsx': "export const A = () => <div style={{ ['--work-top' as string]: '4px', top: 'var(--work-top)' }} />;\n",
      'src/components/B.ts': "document.documentElement.style.setProperty('--dock-gap', '8px');\nexport const gap = 'var(--dock-gap)';\n",
    });
    expect(r.status).toBe(0);
  });

  it('counts the --sc-* tokens tokens.ts generates as defined', () => {
    expect(run({ ...TOKENS, 'src/components/Bar.module.css': '.bar { color: var(--sc-text-body); }\n' }).status).toBe(0);
  });

  it('ignores a name built at run time, which it cannot read', () => {
    expect(run({ ...TOKENS, 'src/components/Z.tsx': 'export const z = (n: string) => `var(--z-${n})`;\n' }).status).toBe(0);
  });

  it('reads no var() in a comment', () => {
    expect(run({ ...TOKENS, 'src/styles/globals.css': '/* every sheet can use var(--z-*) */\n.a { padding: var(--space-2); }\n' }).status).toBe(0);
    expect(run({ ...TOKENS, 'src/components/A.tsx': '// was var(--gone)\nexport const a = 1;\n' }).status).toBe(0);
  });

  it('fails when it reads nothing, rather than passing on nothing', () => {
    expect(run({ 'README.md': 'nothing here\n' }).status).toBe(1);
  });
});
