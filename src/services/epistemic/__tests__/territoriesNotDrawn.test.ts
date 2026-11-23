/**
 * A territory a publisher named and this globe cannot draw.
 *
 * ─── WHY THIS SENTENCE HAS TO EXIST ────────────────────────────────────────
 *
 * regionMarksFor has always returned an `unmatched` list and nothing has ever
 * read it. A report whose only stated place is `us-tx` was therefore absent
 * from the globe with no mark, no count and no sentence — indistinguishable
 * from a report that named nowhere, and from one that never arrived.
 *
 * It matters because a peer's board publishes jurisdictions at three depths:
 * `us`, `us-tx`, `us-tx-leander`. The dataset here holds 242 COUNTRIES, so the
 * deeper two match no polygon. Widening them to the country is refused
 * deliberately — drawing a state's subject as its country is a bigger claim
 * than the publisher made — which leaves saying so as the only honest option.
 */
import { describe, it, expect } from 'vitest';
import { territoriesNotDrawn } from '../epistemicLanguage';

describe('territoriesNotDrawn', () => {
  it('names the codes rather than only counting them', () => {
    // "1 territory not drawn" tells a reader nothing they can act on. The code
    // is the thing they can look up, complain about, or publish differently.
    const note = territoriesNotDrawn(['us-tx']);
    expect(note.text).toContain('us-tx');
  });

  it('says the level is missing, not that the place is unknown', () => {
    // The publisher was perfectly clear. This globe has no polygon at that
    // depth, which is a fact about our map and not about their claim.
    const note = territoriesNotDrawn(['us-tx']);
    expect(note.text).not.toMatch(/unknown|invalid|unrecognised|unrecognized/i);
  });

  it('agrees in number', () => {
    expect(territoriesNotDrawn(['us-tx']).text).toMatch(/1 territory\b/);
    expect(territoriesNotDrawn(['us-tx', 'us-va']).text).toMatch(/2 territories\b/);
  });

  it('lists several without losing any', () => {
    const note = territoriesNotDrawn(['us-tx', 'us-va', 'ca-on']);
    for (const code of ['us-tx', 'us-va', 'ca-on']) {
      expect(note.text).toContain(code);
    }
  });

  it('says a country code the map folds into another is folded, not a missing level', () => {
    // Bonaire (bq) lies inside the Netherlands' shape: there is a boundary at that level, just not on this map.
    expect(territoriesNotDrawn(['bq']).text).toBe('1 territory named and not drawn — this map draws bq inside another territory or not at all.');
    expect(territoriesNotDrawn(['us-tx', 'bq']).text)
      .toBe('2 territories named and not drawn — no boundary at that level for us-tx; this map draws bq inside another territory or not at all.');
  });

  it('warns rather than informs, because something named is missing', () => {
    // An absent mark that the reader would otherwise read as "nothing there".
    expect(territoriesNotDrawn(['us-tx']).tone).toBe('warn');
  });
});
