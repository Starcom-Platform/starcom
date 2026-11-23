/**
 * The Symbol registry (K3), begun with the Intel Report categories (BA12–BA14;
 * plan block J, item 5): each meaning an icon, addressed by what it means.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { INTEL_CATEGORIES, INTEL_CATEGORY_SYMBOLS, GENERIC_CATEGORY_SYMBOL, DIPLOMACY_CATEGORY_SYMBOLS, iconMarkup, symbolById } from '../symbolRegistry';
import { DIPLOMATIC_CATEGORIES } from '../../geopolitical/theme/diplomaticEventTheme';
import { GLYPHS } from '../uiSymbols';
import { reportCategoryOf, categorySymbolOf } from '../../services/intel/reportCategory';

describe('the Intel Report categories', () => {
  it('the fourteen words The Record\'s notes use, each with an icon of its own and what it means', () => {
    expect(INTEL_CATEGORIES).toEqual([
      'conflict', 'charity', 'health', 'funding', 'civic', 'cyber', 'safety', 'intel', 'world', 'remedy',
      'hazard', 'digital', 'aid', 'accountability',
    ]);
    const icons = new Set<string>();
    for (const category of INTEL_CATEGORIES) {
      const symbol = INTEL_CATEGORY_SYMBOLS[category];
      expect(symbol.id).toBe(`intel-category:${category}`);
      expect(symbol.meaning.length).toBeGreaterThan(3);
      expect(symbol.icon.length).toBeGreaterThan(0);
      icons.add(symbol.name);
    }
    // No two categories share an icon, and the generic one is none of theirs.
    expect(icons.size).toBe(INTEL_CATEGORIES.length);
    expect(icons.has(GENERIC_CATEGORY_SYMBOL.name)).toBe(false);
  });

  it('every icon Lucide\'s, under its ISC licence, said so', () => {
    for (const symbol of [...Object.values(INTEL_CATEGORY_SYMBOLS), GENERIC_CATEGORY_SYMBOL]) {
      expect(symbol.source).toEqual({ set: 'Lucide', licence: 'ISC' });
    }
  });
});

describe('an icon as markup', () => {
  it('its elements, scaled from the 24-unit grid into the box given, stroked and never filled', () => {
    const markup = iconMarkup(INTEL_CATEGORY_SYMBOLS.world.icon, { x: 10, y: 20, size: 48, stroke: 3, colour: '#08121a' });
    expect(markup).toMatch(/^<g transform="translate\(10 20\) scale\(2\)" fill="none" stroke="#08121a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">/);
    expect(markup).toContain('<circle cx="12" cy="12" r="10"/>');
    expect(markup).toContain('<path d="M2 12h20"/>');
    expect(markup.endsWith('</g>')).toBe(true);
  });

  it('nothing it is given can break out of the markup', () => {
    const markup = iconMarkup([['path', { d: '"/><script>' }]], { x: 0, y: 0, size: 24, stroke: 2, colour: 'red" onload="x' });
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('" onload');
  });
});

describe('a report\'s category (BA13)', () => {
  it('its stated top-level word, whatever sub-kind follows, in any case', () => {
    expect(reportCategoryOf(['nostr', 'category:conflict', 'category:conflict.wars'])).toBe('conflict');
    expect(reportCategoryOf(['category:Charity.Revocation'])).toBe('charity');
    expect(reportCategoryOf([' category: health '])).toBe('health');
  });

  it('the first stated, where a report states more than one', () => {
    expect(reportCategoryOf(['category:health.outbreak', 'category:conflict'])).toBe('health');
  });

  it('none when it states none, or states nothing usable', () => {
    expect(reportCategoryOf([])).toBeNull();
    expect(reportCategoryOf(['conflict_desk', 'role:context'])).toBeNull();
    expect(reportCategoryOf(['category:', 'category:.wars'])).toBeNull();
    expect(reportCategoryOf(undefined)).toBeNull();
  });

  it('its icon: its own, the generic one for a word not yet given one, none for no category', () => {
    expect(categorySymbolOf('cyber')).toBe(INTEL_CATEGORY_SYMBOLS.cyber);
    expect(categorySymbolOf('weather')).toBe(GENERIC_CATEGORY_SYMBOL);
    expect(categorySymbolOf(null)).toBeNull();
  });
});

/*
 * D-DP, DP4: each cooperative CAMEO category a glyph of its own, none another meaning's, so a key can
 * say what a mark is by its shape as well as its colour. Provisional until the glyph sheet confirms them.
 */
describe('the diplomatic categories', () => {
  it('each its own Lucide icon, used for no other meaning', () => {
    expect(Object.keys(DIPLOMACY_CATEGORY_SYMBOLS)).toEqual(DIPLOMATIC_CATEGORIES);
    const names = Object.values(DIPLOMACY_CATEGORY_SYMBOLS).map((s) => s.name);
    expect(new Set(names).size).toBe(7);
    const taken = new Set([...Object.values(INTEL_CATEGORY_SYMBOLS), ...Object.values(GLYPHS)].map((s) => s.name));
    for (const symbol of Object.values(DIPLOMACY_CATEGORY_SYMBOLS)) {
      expect(taken.has(symbol.name), symbol.name).toBe(false);
      expect(symbol.source).toEqual({ set: 'Lucide', licence: 'ISC' });
      expect(symbol.id).toMatch(/^diplomacy:/);
    }
  });

  it('found by id, as the legend finds a symbol', () => {
    expect(symbolById('diplomacy:aid')).toBe(DIPLOMACY_CATEGORY_SYMBOLS.aid);
  });
});
