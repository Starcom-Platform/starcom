/**
 * guard-emoji: the count of emoji in shipped source never grows (K3).
 *
 * Emoji render differently on every platform, cannot take a colour, and carry
 * no meaning a registry can address. The glyph registry replaces them, screen
 * by screen; this keeps new ones from arriving while it does.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-emoji.mjs';
const run = (files: Record<string, string>) => runGuardIn(GUARD, files);

describe('guard-emoji', () => {
  it('counts the emoji in shipped source and holds at or under its ceiling', () => {
    const r = run({ 'src/components/Bar.tsx': "export const label = 'Ready';\n" });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/EMOJI RATCHET — 0 emoji/);
  });

  it('fails when the count rises past the ceiling, naming the file', () => {
    const many = Array.from({ length: 3000 }, () => '🌍').join('');
    const r = run({ 'src/components/Bar.tsx': `export const label = '${many}';\n` });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/components\/Bar\.tsx/);
  });

  it('counts an emoji once, not its variation selector as a second', () => {
    const r = run({ 'src/a.ts': "export const s = '⚙️🛰️';\n" });
    expect(r.output).toMatch(/EMOJI RATCHET — 2 emoji/);
  });

  it('leaves tests out: a test may quote what it checks for', () => {
    const r = run({
      'src/components/Bar.tsx': "export const label = 'Ready';\n",
      'src/components/__tests__/Bar.test.tsx': "expect(x).not.toContain('🌍');\n",
      'src/c/b.spec.ts': "'🌍'\n",
    });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/EMOJI RATCHET — 0 emoji in 0 of 1 files/);
  });

  it('fails on nothing to read rather than passing', () => {
    const r = run({ 'README.md': 'nothing here\n' });
    expect(r.status).toBe(1);
  });
});
