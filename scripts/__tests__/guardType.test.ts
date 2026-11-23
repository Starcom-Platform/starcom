/**
 * The type guards (plan item 8.2): no stylesheet or component names a font
 * family of its own, and sizes under 11 px only go down. Watched failing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGuardIn } from './guardHarness';
// @ts-expect-error a plain .mjs module, without types
import { fontFamilyLiterals, smallSizes } from '../lib/typeLiterals.mjs';

const fixture = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'type-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
};

describe('fontFamilyLiterals', () => {
  it('finds a family named in css or a component, and allows the tokens, inherit and @font-face', () => {
    const root = fixture({
      'src/a.css': ".a { font-family: 'Orbitron', monospace; }\n.b { font-family: var(--sc-font-text); }\n.c { font-family: inherit; }\n@font-face { font-family: 'Aldrich'; src: url(x.ttf); }",
      'src/b.tsx': "export const B = () => <p style={{ fontFamily: 'Courier New, monospace' }} />;\nexport const C = () => <p style={{ fontFamily: 'var(--sc-font-data)' }} />;",
      'src/styles/tokens.ts': "export const F = { text: \"'IBM Plex Sans', sans-serif\" }; const x = { fontFamily: 'Oxanium' };",
      'src/__tests__/t.test.tsx': "const x = { fontFamily: 'Arial' };",
      // A double-quoted value holding single quotes, a stack kept in a constant,
      // and a canvas font: each names a family as surely as a declaration does.
      'src/c.tsx': "const a = { fontFamily: \"'Aldrich-Regular', monospace\" };\nconst DISPLAY = \"'Aldrich', monospace\";\nctx.font = 'bold 12px Orbitron, sans-serif';\nconst ok = 'var(--sc-font-data)';",
      // A family double-quoted inside a single-quoted canvas font: 16 of these
      // were missed until 2026-10-01, because the pattern allowed only a single
      // quote before the comma.
      'src/d.tsx': "ctx.font = '14px \"Courier New\", monospace';",
    });
    const found = fontFamilyLiterals(root);
    expect(found.map((f: { file: string; value: string }) => `${f.file}: ${f.value}`)).toEqual([
      "src/a.css: 'Orbitron', monospace",
      'src/b.tsx: Courier New, monospace',
      "src/c.tsx: 'Aldrich-Regular', monospace",
      "src/c.tsx: 'Aldrich', monospace",
      'src/c.tsx: bold 12px Orbitron, sans-serif',
      'src/d.tsx: 14px "Courier New", monospace',
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('smallSizes', () => {
  it('counts sizes under 11 px, in px or rem, in css and components, and no others', () => {
    const root = fixture({
      'src/a.css': '.a { font-size: 10px; }\n.b { font-size: 11px; }\n.c { font-size: 0.6rem; }\n.d { font-size: 0.75rem; }\n.e { font-size: 1.2em; }',
      'src/b.tsx': "export const B = () => <p style={{ fontSize: 9 }} />;\nexport const C = () => <p style={{ fontSize: '10px' }} />;\nexport const D = () => <p style={{ fontSize: 12 }} />;\nexport const E = () => <text fontSize={8} />;",
    });
    const found = smallSizes(root);
    expect(found.map((f: { file: string; px: number }) => `${f.file} ${f.px}`)).toEqual([
      'src/a.css 10', 'src/a.css 9.6', 'src/b.tsx 9', 'src/b.tsx 10', 'src/b.tsx 8',
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('guard-font-families', () => {
  it('fails on a family named directly, and passes on the tokens', () => {
    const bad = runGuardIn('guard-font-families.mjs', { 'src/a.css': ".a { font-family: 'Orbitron', monospace; }" });
    expect(bad.status).toBe(1);
    expect(bad.output).toMatch(/src\/a\.css.*Orbitron/);
    expect(runGuardIn('guard-font-families.mjs', { 'src/a.css': '.a { font-family: var(--sc-font-display); }' }).status).toBe(0);
  });

  it('fails when it reads nothing', () => {
    expect(runGuardIn('guard-font-families.mjs', { 'README.md': 'x' }).status).toBe(1);
  });
});

describe('guard-small-type', () => {
  const CEILING = Number(/const CEILING = (\d+);/.exec(fs.readFileSync(path.join(process.cwd(), 'scripts/guard-small-type.mjs'), 'utf8'))![1]);
  const lines = (n: number) => Array.from({ length: n }, () => '.a { font-size: 10px; }').join('\n');

  it('passes at the ceiling and fails one over it', () => {
    expect(runGuardIn('guard-small-type.mjs', { 'src/a.css': lines(CEILING) }).status).toBe(0);
    const over = runGuardIn('guard-small-type.mjs', { 'src/a.css': lines(CEILING + 1) });
    expect(over.status).toBe(1);
    expect(over.output).toMatch(/the count went up/);
  });

  it('fails when it reads nothing', () => {
    expect(runGuardIn('guard-small-type.mjs', { 'README.md': 'x' }).status).toBe(1);
  });
});
