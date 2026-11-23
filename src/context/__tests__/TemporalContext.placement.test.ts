/**
 * The shared time state is provided once, in App, above every screen and every
 * popup (decision D-E, settled 2026-09-14 for step 8). It was provided inside the
 * globe's HUD layout, so IntelAnalyzer, a separate screen, could not read the
 * window the globe showed; and a second provider would split the state in two
 * without any error to say so.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');

function componentFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : componentFiles(full);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

/** A JSX mount of the provider at the start of a line, which a comment naming it is not. */
const MOUNT = /^\s*<TemporalProvider\b/m;

describe('the shared time state', () => {
  it('is provided once, in App', () => {
    const mounts = componentFiles(SRC).filter((file) => MOUNT.test(fs.readFileSync(file, 'utf8')));
    expect(mounts.map((file) => path.relative(SRC, file))).toEqual(['App.tsx']);
  });

  it('wraps every screen and every popup', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    const open = app.search(MOUNT);
    const close = app.indexOf('</TemporalProvider>');
    expect(open).toBeGreaterThan(-1);
    // Every popup is drawn by the popup layer, RoutedPopupLayer: PopupProvider inside
    // the page router and the application router.
    for (const inside of ['<RoutedPopupLayer>', '<AppContent />', '</RoutedPopupLayer>']) {
      const at = app.indexOf(inside);
      expect(at).toBeGreaterThan(open);
      expect(at).toBeLessThan(close);
    }
    const layer = fs.readFileSync(path.join(SRC, 'components', 'Popup', 'RoutedPopupLayer.tsx'), 'utf8');
    expect(layer).toMatch(/<PopupProvider>/);
  });
});
