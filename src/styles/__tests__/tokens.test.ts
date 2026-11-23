/**
 * One token set (plan item 8.1, decision D6): the palette in
 * docs/missions/04-plan/interface-upgrade.md, its roles, and the contrast that
 * document states for each. The contrast is computed here with the WCAG 2.2
 * formula, so a token changed later cannot quietly fail the text it carries.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GUNMETAL, CYAN, SEMANTIC, ROLES, FONTS, MIN_TEXT_PX, SECTIONS, TLP, contrast, oklch, oklabDistance, tokenVariables } from '../tokens';

describe('the palette', () => {
  it('is the one the interface document sets out', () => {
    expect(GUNMETAL).toEqual({ 950: '#0A1113', 900: '#131B1E', 800: '#1C262A', 700: '#283439', 600: '#3A474D', 500: '#5D6C72', 400: '#818F94', 300: '#A1ADB2', 200: '#C7CFD3', 100: '#E9EEF0' });
    expect(CYAN).toEqual({ 900: '#002F36', 800: '#004952', 700: '#006774', 600: '#008797', 500: '#00A5B9', 400: '#00C3DB', 300: '#3ADAF2', 200: '#7CEBFE', 100: '#B8F4FF', 50: '#E2FAFF' });
    expect(SEMANTIC).toEqual({ ok: '#6CE98D', caution: '#FFB848', danger: '#FF7266', unknown: '#F3E749', protected: '#C9ACFF', severity: ['#EACF83', '#FAAB3F', '#FD8537', '#FB594D'] });
  });

  it('gives each surface, text and accent its role', () => {
    expect(ROLES.surface).toEqual({ globe: GUNMETAL[950], frame: GUNMETAL[900], panel: GUNMETAL[800], input: GUNMETAL[700], divider: GUNMETAL[600] });
    expect(ROLES.text).toEqual({ heading: GUNMETAL[100], body: GUNMETAL[200], secondary: GUNMETAL[300], muted: GUNMETAL[400] });
    expect(ROLES.accent).toEqual({ accent: CYAN[400], focus: CYAN[400], buttonFill: CYAN[500], buttonLabel: GUNMETAL[950], inputBorder: GUNMETAL[400] });
  });
});

describe('contrast, by the WCAG 2.2 formula', () => {
  it('reproduces the published calibration: #767676 on white is 4.54', () => {
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('holds every ratio the document states for text on a panel', () => {
    const panel = ROLES.surface.panel;
    const stated: Array<[string, string, number]> = [
      ['body', ROLES.text.body, 9.77], ['secondary', ROLES.text.secondary, 6.72], ['muted', ROLES.text.muted, 4.62],
      ['cyan 400', CYAN[400], 7.23], ['ok', SEMANTIC.ok, 10.06], ['caution', SEMANTIC.caution, 8.97],
      ['danger', SEMANTIC.danger, 5.77], ['protected', SEMANTIC.protected, 7.96],
    ];
    for (const [name, colour, ratio] of stated) expect(contrast(colour, panel), name).toBeCloseTo(ratio, 1);
    for (const colour of SEMANTIC.severity.slice(0, 3)) expect(contrast(colour, panel)).toBeGreaterThanOrEqual(6.3);
    // Every text role meets AA (4.5) on a panel.
    for (const colour of Object.values(ROLES.text)) expect(contrast(colour, panel)).toBeGreaterThanOrEqual(4.5);
  });

  it('labels a button legibly: gunmetal 950 on cyan 500', () => {
    expect(contrast(ROLES.accent.buttonLabel, ROLES.accent.buttonFill)).toBeCloseTo(6.42, 1);
  });

  it('keeps the failures the document names as failures, so no one uses them for text', () => {
    expect(contrast(ROLES.text.muted, ROLES.surface.input)).toBeLessThan(4.5);
    expect(contrast(CYAN[500], ROLES.surface.input)).toBeLessThan(4.5);
    // An input border needs gunmetal 400; 500 is too faint on a panel.
    expect(contrast(ROLES.accent.inputBorder, ROLES.surface.panel)).toBeCloseTo(4.62, 1);
    expect(contrast(GUNMETAL[500], ROLES.surface.panel)).toBeCloseTo(2.83, 1);
  });
});

describe('tokenVariables', () => {
  it('names every colour and role as a CSS custom property', () => {
    const vars = tokenVariables();
    expect(vars['--sc-gunmetal-800']).toBe('#1C262A');
    expect(vars['--sc-cyan-400']).toBe('#00C3DB');
    expect(vars['--sc-surface-panel']).toBe(ROLES.surface.panel);
    expect(vars['--sc-text-body']).toBe(ROLES.text.body);
    expect(vars['--sc-accent']).toBe(CYAN[400]);
    expect(vars['--sc-ok']).toBe(SEMANTIC.ok);
    expect(vars['--sc-severity-4']).toBe(SEMANTIC.severity[3]);
    expect(Object.keys(vars).every((k) => /^--sc-[a-z0-9-]+$/.test(k))).toBe(true);
    expect(vars['--sc-font-text']).toBe(FONTS.text);
    // Gunmetal, cyan, surfaces, text, accents, fonts, semantics, severities, the six section tints and TLP's four.
    expect(Object.keys(vars)).toHaveLength(10 + 10 + 5 + 4 + 5 + 4 + 5 + 4 + 6 + 4);
  });
});

describe('type (plan item 8.2, pairing A, decided 2026-09-26)', () => {
  it('sets Oxanium for display, IBM Plex Sans for text, JetBrains Mono for data, and Aldrich for the wordmark only', () => {
    expect(FONTS.display.split(',')[0]).toBe("'Oxanium'");
    expect(FONTS.text.split(',')[0]).toBe("'IBM Plex Sans'");
    expect(FONTS.data.split(',')[0]).toBe("'JetBrains Mono'");
    expect(FONTS.wordmark.split(',')[0]).toBe("'Aldrich'");
    // Each falls back to a family of the same kind, never to a different one.
    expect(FONTS.data).toMatch(/monospace$/);
    expect(FONTS.text).toMatch(/sans-serif$/);
  });

  it('sets nothing smaller than 11 px', () => {
    expect(MIN_TEXT_PX).toBe(11);
  });
});

/*
 * The section tints (BD2, BD10): a tint in the frame only, picked on the swatch
 * sheet. "A test that fails any hue too dark for its background", and one that
 * fails a tint that could be taken for a status.
 */
describe('the section tints', () => {
  const tints = Object.entries(SECTIONS);

  it('are the six the owner picked', () => {
    expect(Object.fromEntries(tints.map(([k, s]) => [k, s.tint]))).toEqual({
      situation: '#ABB8D2', collect: '#92BDE2', investigate: '#BFB89B',
      assemble: '#CAB680', analyse: '#9FC0B3', publish: '#D4ABB6',
    });
  });

  it('read as text on the frame and on a panel', () => {
    for (const [key, s] of tints) {
      expect(contrast(s.tint, ROLES.surface.frame), key).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.tint, ROLES.surface.panel), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('are greys, never a status or the interactive cyan', () => {
    const statuses = [SEMANTIC.ok, SEMANTIC.caution, SEMANTIC.danger, SEMANTIC.unknown, SEMANTIC.protected, ...SEMANTIC.severity, ROLES.accent.accent];
    for (const [key, s] of tints) {
      expect(oklch(s.tint).c, key).toBeLessThanOrEqual(0.08);
      for (const status of statuses) expect(oklabDistance(s.tint, status), `${key} vs ${status}`).toBeGreaterThanOrEqual(0.075);
    }
  });

  it('are CSS custom properties, one a section', () => {
    const vars = tokenVariables();
    for (const [key, s] of tints) expect(vars[`--sc-tint-${key}`]).toBe(s.tint);
  });
});


describe('distribution, in the Traffic Light Protocol\'s colours (BD3)', () => {
  it('are TLP 2.0\'s own: clear, green and red text on black', () => {
    expect(TLP).toEqual({ black: '#000000', clear: '#FFFFFF', green: '#33FF00', red: '#FF2B2B' });
  });

  it('read on their black chip', () => {
    for (const [key, hex] of Object.entries(TLP)) {
      if (key !== 'black') expect(contrast(hex, TLP.black), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('are CSS custom properties', () => {
    const vars = tokenVariables();
    for (const [key, hex] of Object.entries(TLP)) expect(vars[`--sc-tlp-${key}`]).toBe(hex);
  });
});

describe('every --sc- variable the source reads', () => {
  // guard-undefined-css-vars leaves --sc- names to the tokens, so a misspelt
  // one would be dropped by the browser with no complaint from anything.
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === '__tests__' ? [] : walk(p)) : [p];
  });

  it('is a token', () => {
    const vars = tokenVariables();
    const unknown: string[] = [];
    for (const file of walk('src').filter((f) => /\.(css|tsx?)$/.test(f))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\((--sc-[a-z0-9-]+)/g)) {
        // A name built in a template, `--sc-tint-${section}`, is checked where its parts are.
        if (!m[1].endsWith('-') && !(m[1] in vars)) unknown.push(`${file}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
