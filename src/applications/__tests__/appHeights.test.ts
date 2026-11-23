/**
 * An app fills the shell's area, never the window (critique audit of
 * 2026-10-01, sections 5, 7, 8 and 9; plan block F, item 3).
 *
 * The shell gives an app what is left between its header, strip and bottom
 * bar, and hides what overflows it. Apps that set their own height from the
 * window, `100vh` or `calc(100vh - N px)`, were taller than that space, so
 * their bottoms were cut off: the Market Exchange's list could never be
 * scrolled to its last 66 px, OpsCenter lost about 37 px, and IntelWeb and the
 * Analyzer lost the shell's 143 px. An app takes 100% of its area and lets its
 * own scroll areas flex into it.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('apps under src/applications', () => {
  it('take no height or width from the window', () => {
    const found = sources(ROOT).flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .map((line, i) => ({ path: path.slice(ROOT.length + 1), line: i + 1, text: line.trim() }))
      .filter(({ text }) => /\b100v[hw]\b|calc\(\s*100v[hw]/.test(text) && !/^\s*(\/\/|\*|\/\*)/.test(text)));
    expect(found.map(({ path, line, text }) => `${path}:${line} ${text}`)).toEqual([]);
  });
});

/*
 * K4, the tight shell: an app's shell padded itself with MUI's p: 3, 24 px on
 * every side at every width, so a phone lost 48 px of its 390 to padding before
 * the app drew anything. The shells take SHELL_PADDING, 8 px on a phone and
 * 16 px from md up.
 */
describe('the app shells', () => {
  const SHELLS = [
    'teamworkspace/TeamWorkspaceApplication.tsx',
    'marketexchange/MarketExchangeApplication.tsx',
    '../pages/Cases/CasesDashboard.tsx',
  ];

  it('pad with SHELL_PADDING, not p: 3', () => {
    for (const shell of SHELLS) {
      const text = readFileSync(resolve(ROOT, shell), 'utf8');
      expect(text, shell).toMatch(/p: SHELL_PADDING/);
    }
  });

  it('SHELL_PADDING is 8 px on a phone and 16 px from md up', async () => {
    const { SHELL_PADDING } = await import('../../styles/shell');
    expect(SHELL_PADDING).toEqual({ xs: 1, md: 2 });
  });
});
