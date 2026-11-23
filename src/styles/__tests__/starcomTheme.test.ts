/**
 * The one MUI theme, made from the tokens (plan item 8.1). The root theme
 * carried only the z-index scale, so every screen without a theme of its own
 * (Cases, NetRunner, Help, the coach) drew MUI's light default inside a dark
 * app, and each application that had one picked its own colours.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starcomTheme, starcomPalette } from '../starcomTheme';
import { CYAN, GUNMETAL, SEMANTIC, ROLES, FONTS, contrast } from '../tokens';
import { muiZIndex } from '../layers';

describe('starcomTheme', () => {
  it('is dark, on the token surfaces, with the token text', () => {
    const p = starcomTheme.palette;
    expect(p.mode).toBe('dark');
    expect(p.background.default).toBe(ROLES.surface.frame);
    expect(p.background.paper).toBe(ROLES.surface.panel);
    expect(p.text.primary).toBe(ROLES.text.body);
    expect(p.text.secondary).toBe(ROLES.text.secondary);
    expect(p.divider).toBe(ROLES.surface.divider);
  });

  it('gives each meaning its one colour', () => {
    const p = starcomTheme.palette;
    expect(p.primary.main).toBe(CYAN[500]);
    expect(p.primary.contrastText).toBe(GUNMETAL[950]);
    expect(p.info.main).toBe(CYAN[400]);
    expect(p.success.main).toBe(SEMANTIC.ok);
    expect(p.warning.main).toBe(SEMANTIC.caution);
    expect(p.error.main).toBe(SEMANTIC.danger);
    // Grey means unknown or not judged, never "bad".
    expect(p.secondary.main).toBe(GUNMETAL[400]);
  });

  it("keeps the analyzer's text readable on its black rail", () => {
    // IntelAnalyzer's surfaces are black. Under MUI's light default its
    // secondary text was black on black (2026-09-26); it had a theme of its
    // own for that, which this one replaces.
    expect(contrast(starcomTheme.palette.text.primary, '#000000')).toBeGreaterThanOrEqual(7);
    expect(contrast(starcomTheme.palette.text.secondary, '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('sets type from the tokens: text in IBM Plex Sans, headings in Oxanium, nothing under 11 px', () => {
    const t = starcomTheme.typography;
    expect(t.fontFamily).toBe(FONTS.text);
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) expect(t[h].fontFamily, h).toBe(FONTS.display);
    for (const v of ['caption', 'overline', 'body2', 'button'] as const) {
      expect(parseFloat(String(t[v].fontSize)) * 16, v).toBeGreaterThanOrEqual(11);
    }
  });

  it('keeps the z-index scale the root theme carried', () => {
    for (const [k, v] of Object.entries(muiZIndex)) expect((starcomTheme.zIndex as Record<string, number>)[k], k).toBe(v);
  });
});

describe('one palette', () => {
  it('lets no theme name its own font', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) { if (entry !== '__tests__') walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (!/\bcreateTheme\(/.test(text)) continue;
        const rel = path.relative(process.cwd(), full).split(path.sep).join('/');
        if (rel !== 'src/styles/starcomTheme.ts' && /typography:\s*\{/.test(text)) offenders.push(rel);
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('is the only one: every other theme in the app is built on it, with no palette of its own', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) { if (entry !== '__tests__') walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (!/\bcreateTheme\(/.test(text)) continue;
        const rel = path.relative(process.cwd(), full).split(path.sep).join('/');
        if (rel === 'src/styles/starcomTheme.ts') continue;
        // Built on the root theme (MUI's documented composition), adding only
        // component styles: no palette and no type of its own.
        if (!/createTheme\(\s*starcomTheme\s*,/.test(text) || /\bpalette:/.test(text)) offenders.push(rel);
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('is the theme the app is mounted under', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(main).toMatch(/<ThemeProvider theme=\{starcomTheme\}>/);
    // And the tokens reach stylesheets as custom properties, from the same source.
    expect(main).toMatch(/<GlobalStyles styles=\{\{ ':root': tokenVariables\(\) \}\} \/>/);
    expect(starcomPalette.mode).toBe('dark');
  });
});
