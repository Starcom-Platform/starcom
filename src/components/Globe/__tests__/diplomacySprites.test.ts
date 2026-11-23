/**
 * Diplomacy's marks up close (decision D-DP, DP12): the kind's glyph on a mark of its colour, as Intel
 * Reports draw their emblems. One atlas: a column per kind, in CAMEO's order; a row per backing — a
 * disc, a hollow ring for a place GDELT put only at a country, and a dashed ring for that place under
 * the Ring style (DP13).
 */
import { describe, expect, it } from 'vitest';
import { diplomacyAtlasRows, DIPLOMACY_ROWS, DIPLOMACY_LAYOUT, diplomacyRowFor } from '../diplomacySprites';
import { DIPLOMATIC_CATEGORIES, diplomaticEventColor } from '../../../geopolitical/theme/diplomaticEventTheme';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../../symbols/symbolRegistry';
import { cssColorOf } from '../../../services/globe/globeLegendStore';

describe('the atlas', () => {
  const rows = diplomacyAtlasRows();

  it('has a column per kind and a row per backing', () => {
    expect(DIPLOMACY_ROWS).toEqual(['disc', 'ring', 'dashedRing']);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveLength(DIPLOMATIC_CATEGORIES.length);
    expect(DIPLOMACY_LAYOUT).toMatchObject({ cellCount: 7, rowCount: 3 });
  });

  it('draws each kind in its colour, with its glyph', () => {
    DIPLOMATIC_CATEGORIES.forEach((category, i) => {
      const colour = cssColorOf(diplomaticEventColor(category));
      const firstPath = DIPLOMACY_CATEGORY_SYMBOLS[category].icon[0][1];
      for (const row of rows) {
        expect(row[i]).toContain(colour);
        expect(row[i]).toContain(String(Object.values(firstPath)[0]));
      }
    });
  });

  it('fills the disc, leaves the ring hollow, and dashes the dashed ring', () => {
    const [disc, ring, dashed] = rows.map((row) => row[0]);
    expect(disc).toMatch(/<circle[^>]*fill="#9fb4d8"/);
    expect(ring).not.toMatch(/<circle[^>]*fill="#9fb4d8"/);
    expect(ring).not.toContain('stroke-dasharray');
    expect(dashed).toContain('stroke-dasharray');
  });
});

describe('a place\'s backing', () => {
  it('is the chosen style\'s for a place, a ring for a country, dashed where every mark is a ring', () => {
    expect([diplomacyRowFor('disc', false), diplomacyRowFor('glow', false), diplomacyRowFor('ring', false)]).toEqual([0, 0, 1]);
    expect([diplomacyRowFor('disc', true), diplomacyRowFor('glow', true), diplomacyRowFor('ring', true)]).toEqual([1, 1, 2]);
  });
});
