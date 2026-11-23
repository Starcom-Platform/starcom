/**
 * One scale, two representations, checked.
 *
 * layers.ts holds the values JavaScript needs (MUI's theme); z-index.css holds
 * the same values for CSS. Nothing enforces that two hand-maintained files
 * agree except this.
 *
 * The collision it exists to prevent already happened once: MUI shipped its own
 * zIndex block with no override, and our --z-tooltip sat at exactly MUI's
 * tooltip value, so the two stacked by DOM order — the precise bug the scale
 * was written to remove.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createTheme } from '@mui/material/styles';
import { LAYERS, muiZIndex } from '../layers';
import { starcomTheme } from '../starcomTheme';

const css = fs.readFileSync('src/styles/z-index.css', 'utf8');

/** --z-modal-backdrop ⇄ modalBackdrop */
const cssName = (k: string) => '--z-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

describe('the CSS mirrors the TypeScript', () => {
  for (const [key, value] of Object.entries(LAYERS)) {
    it(`${cssName(key)} is ${value}`, () => {
      const m = css.match(new RegExp(`${cssName(key)}:\\s*(-?\\d+)\\s*;`));
      expect(m, `${cssName(key)} missing from z-index.css`).toBeTruthy();
      expect(Number(m![1])).toBe(value);
    });
  }

  it('defines nothing the TypeScript does not', () => {
    // A token in CSS with no TS counterpart is invisible to MUI and to any
    // future runtime check — the exact gap that let two scales coexist before.
    const inCss = [...css.matchAll(/^\s*(--z-[a-z-]+):/gm)].map((m) => m[1]);
    const known = Object.keys(LAYERS).map(cssName);
    expect(inCss.filter((t) => !known.includes(t))).toEqual([]);
  });
});

describe('the scale is ordered by how much a layer interrupts', () => {
  it('puts tooltip above modal', () => {
    // The error MUI caught. A tooltip on a control inside a modal must be
    // readable; one rendered behind the thing it explains is worse than none.
    expect(LAYERS.tooltip).toBeGreaterThan(LAYERS.modal);
  });

  it('puts notification above modal', () => {
    // A notification may be reporting that the modal's own action failed.
    expect(LAYERS.notification).toBeGreaterThan(LAYERS.modal);
  });

  it('keeps a backdrop immediately below its modal', () => {
    expect(LAYERS.modalBackdrop).toBeLessThan(LAYERS.modal);
    expect(LAYERS.modal - LAYERS.modalBackdrop).toBeLessThanOrEqual(100);
  });

  it('assigns every tier a distinct value', () => {
    const vals = Object.values(LAYERS);
    expect(new Set(vals).size).toBe(vals.length);
  });
});

describe('MUI obeys this scale rather than running its own', () => {
  const MUI_DEFAULTS = {
    mobileStepper: 1000, fab: 1050, speedDial: 1050, appBar: 1100,
    drawer: 1200, modal: 1300, snackbar: 1400, tooltip: 1500,
  };

  it('overrides every MUI role', () => {
    // A role left at MUI's default is a value outside our scale, which is how
    // the original collision happened.
    expect(Object.keys(muiZIndex).sort()).toEqual(Object.keys(MUI_DEFAULTS).sort());
  });

  it('shares no value with a MUI default', () => {
    const ours = new Set(Object.values(muiZIndex) as number[]);
    const theirs = new Set(Object.values(MUI_DEFAULTS));
    expect([...ours].filter((v) => theirs.has(v))).toEqual([]);
  });

  it('preserves the relative order MUI got right', () => {
    // modal < snackbar < tooltip. Remapping onto our tiers must not invert it.
    expect(muiZIndex.modal).toBeLessThan(muiZIndex.snackbar);
    expect(muiZIndex.snackbar).toBeLessThan(muiZIndex.tooltip);
  });

  it('maps every MUI role to a real tier, not an ad-hoc number', () => {
    const tiers = new Set(Object.values(LAYERS) as number[]);
    for (const [role, v] of Object.entries(muiZIndex)) {
      expect(tiers.has(v as number), `${role} is not a tier value`).toBe(true);
    }
  });
});

describe('the scale reaches MUI components nobody wrapped', () => {
  it('gives the root theme our zIndex', () => {
    for (const [role, v] of Object.entries(muiZIndex)) {
      expect(starcomTheme.zIndex[role as keyof typeof starcomTheme.zIndex]).toBe(v);
    }
  });

  it('carries type and palette now, by deliberate commits (plan items 8.1 and 8.2)', () => {
    // The root theme carried only the scale, so that a palette and type would
    // arrive in deliberate commits and not inside a bug fix. They did; see
    // starcomTheme.test.ts.
    const stock = createTheme();
    expect(starcomTheme.typography.fontFamily).not.toBe(stock.typography.fontFamily);
  });

  it('is mounted at the application root', () => {
    // The theme only matters if something provides it. Twelve MUI overlay files
    // sit outside all three application ThemeProviders; this is what covers them.
    const main = fs.readFileSync('src/main.tsx', 'utf8');
    expect(main).toMatch(/<ThemeProvider theme=\{starcomTheme\}>/);
  });
});
