/**
 * The hard-coded colour ratchet (plan item 8.1): watched failing, as every
 * guard here must be. It counts with the module that ships.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runGuardIn } from './guardHarness';
// @ts-expect-error a plain .mjs module, without types
import { countColourLiterals } from '../lib/colourLiterals.mjs';

const GUARD = 'guard-hardcoded-colors.mjs';
const CEILING = Number(/const CEILING = (\d+);/.exec(fs.readFileSync(path.join(process.cwd(), 'scripts', GUARD), 'utf8'))![1]);
const lines = (n: number) => Array.from({ length: n }, () => '.a { color: #fff; }').join('\n');

describe('guard-hardcoded-colors', () => {
  it('passes at the ceiling and fails one literal over it', () => {
    expect(runGuardIn(GUARD, { 'src/a.css': lines(CEILING) }).status).toBe(0);
    const over = runGuardIn(GUARD, { 'src/a.css': lines(CEILING + 1) });
    expect(over.status).toBe(1);
    expect(over.output).toMatch(/the count went up/);
    expect(over.output).toMatch(/src\/a\.css/);
  });

  it('fails when it reads nothing', () => {
    const r = runGuardIn(GUARD, { 'README.md': 'no source here\n' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/nothing to read/);
  });

  it('holds on the repository as it is', () => {
    // Throws, failing the test, if the guard exits non-zero here.
    const out = execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', GUARD)], { cwd: process.cwd(), encoding: 'utf8' });
    expect(out).toMatch(/colour literals in \d+ files/);
  });
});

describe('countColourLiterals', () => {
  it('counts hex and rgb()/rgba() in css, ts and tsx, and nothing in tests, mocks or the token file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'colours-'));
    const put = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    put('src/a.css', '.a { color: #fff; background: rgba(0, 0, 0, 0.5); border-color: #00A5B9; outline-color: #00a5b980; }');
    put('src/b.tsx', "export const B = () => <div style={{ color: 'rgb(1, 2, 3)' }} />;");
    put('src/c.ts', "export const C = '#123';");
    put('src/styles/tokens.ts', "export const T = '#0A1113';");
    put('src/__tests__/x.test.ts', "const x = '#ffffff';");
    put('src/d.test.tsx', "const x = '#ffffff';");
    put('src/e.md', '#ffffff');
    const r = countColourLiterals(root);
    expect(r.total).toBe(4 + 1 + 1);
    expect(Object.fromEntries(r.byFile)).toEqual({ 'src/a.css': 4, 'src/b.tsx': 1, 'src/c.ts': 1 });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
