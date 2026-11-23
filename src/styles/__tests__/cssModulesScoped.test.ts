/**
 * A CSS module styles only its own component. A bare element selector in one
 * is global all the same: the report editor's `label` rule turned every label
 * in the app into an upper-case column once the editor had loaded, and the
 * Intel console's `textarea` rule restyled every text box, MUI's included
 * (found with the reviews panel, plan item 5.1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
const modules = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : modules(path);
  return name.endsWith('.module.css') ? [path] : [];
});

const bareSelectors = (css: string): string[] => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Top-level rules only: at-rule bodies (keyframes, media) are read as their own rules below.
  return withoutComments.split('}').map((rule) => rule.split('{').at(-2) ?? rule.split('{')[0])
    .flatMap((s) => s.split(',')).map((s) => s.trim())
    .filter((s) => /^[a-z]+[1-6]?(:[a-z-]+)?$/.test(s) && !/^(from|to)$/.test(s));
};

describe('CSS modules', () => {
  it('have no rule for a bare element, which would apply to the whole app', () => {
    const found = modules(SRC).map((file) => ({ file: relative(SRC, file), bare: bareSelectors(readFileSync(file, 'utf8')) })).filter((m) => m.bare.length);
    expect(found).toEqual([]);
  });
});
