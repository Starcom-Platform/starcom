/**
 * A card's alt text (block I, item 5; the shot's `output.alt`), written from the
 * same facts the card states: its badge and its whole headline, which the card
 * may shorten; its facts; what the picture shows; every caveat that applies, in
 * its short form; and when Starcom made it. Never authored by the caller.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildGlobeViewProvenance, type BuildProvenanceInput } from '../shareCardProvenance';
import { altTextFor, ALT_TEXT_MAX } from '../cardAltText';

const AT = new Date('2026-10-03T01:24:14.000Z');
const TITLE = 'Pakistan launches airstrikes in Afghanistan, claiming the killing of 22 Taliban fighters at two locations, while the Government of Afghanistan reports that nine women were killed';
const input = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 35, lon: 71.2, altitude: 1 },
  frame: { width: 1080, height: 1080 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  featured: {
    id: 'x', title: TITLE,
    lines: ['War & Conflict · Airstrike · Afghanistan–Pakistan war', 'Casualties as reported: 22 killed; 9 killed (separate claims, not added)'],
  },
  template: { name: 'critical_intel', chosenBy: 'item' },
  now: AT,
  ...over,
});

describe('alt text', () => {
  it('opens with the badge and the whole headline, which the card may shorten', () => {
    const alt = altTextFor(buildGlobeViewProvenance(input()), { fit: 'view', keyLayers: ['War & Conflict', 'Borders'] });
    expect(alt.startsWith(`CRITICAL INTEL: ${TITLE}.`)).toBe(true);
  });

  it('states the facts, in words a screen reader says well', () => {
    const alt = altTextFor(buildGlobeViewProvenance(input()), { fit: 'view', keyLayers: null });
    expect(alt).toContain('War & Conflict, Airstrike, Afghanistan–Pakistan war.');
    expect(alt).toContain('Casualties as reported: 22 killed; 9 killed (separate claims, not added).');
    expect(alt).not.toContain(' · ');
  });

  it('adds no full stop after a title the source already cut with an ellipsis', () => {
    const cut = 'American troops complete their withdrawal from Iraq, and also the 12-year U.S. intervention against the Islamic…';
    const alt = altTextFor(buildGlobeViewProvenance(input({ featured: { id: 'x', title: cut, lines: [] } })), { fit: 'view', keyLayers: null });
    expect(alt).toContain('against the Islamic… The picture:');
  });

  it('says what the picture shows: the view or the whole planet, where, the item, and the layers keyed', () => {
    const view = altTextFor(buildGlobeViewProvenance(input()), { fit: 'view', keyLayers: ['War & Conflict', 'Borders'] });
    expect(view).toContain('The picture: the globe centred near 35.0°N, 71.2°E, the item marked and labelled, showing War & Conflict and Borders.');
    const planet = altTextFor(buildGlobeViewProvenance(input({ featured: null, camera: { lat: -12.5, lon: -45, altitude: 2.5 } })), { fit: 'planet', keyLayers: ['War & Conflict'] });
    expect(planet).toContain('The picture: the whole planet centred near 12.5°S, 45.0°W, showing War & Conflict.');
  });

  it('says an area or a theatre is lit, not an item marked', () => {
    const about = (id: string) => altTextFor(
      buildGlobeViewProvenance(input({ featured: { id, title: 'Somewhere', lines: [] }, template: undefined })),
      { fit: 'view', keyLayers: null },
    );
    expect(about('area:union:eu')).toContain('35.0°N, 71.2°E, the area lit and labelled, showing');
    expect(about('theatre:russia-ukraine')).toContain('35.0°N, 71.2°E, the theatre\'s countries lit and labelled, showing');
    expect(about('30023:pk:item')).toContain('35.0°N, 71.2°E, the item marked and labelled, showing');
  });

  it('carries every caveat, in its short form', () => {
    const p = buildGlobeViewProvenance(input());
    const alt = altTextFor(p, { fit: 'view', keyLayers: null });
    expect(p.caveatsShort.length).toBeGreaterThan(0);
    for (const caveat of p.caveatsShort) expect(alt).toContain(caveat);
  });

  it('ends with when Starcom made it', () => {
    expect(altTextFor(buildGlobeViewProvenance(input()), { fit: 'view', keyLayers: null }).endsWith('Made by Starcom, 2026-10-03 01:24Z.')).toBe(true);
  });

  it('heads a front page with its title and facts, and a card about nothing with what it shows', () => {
    const brief = buildGlobeViewProvenance(input({
      featured: null, template: { name: 'conflict_brief', chosenBy: 'subject' },
      frontPage: { template: 'conflict_brief', day: '2026-10-03', title: 'War & Conflict Brief · 3 Oct 2026', lines: ['24 items reported on 3 Oct 2026 (UTC)'], count: 24, theatres: [], noTheatre: 24 },
    }));
    expect(altTextFor(brief, { fit: 'planet', keyLayers: null })).toMatch(/^WAR & CONFLICT BRIEF: War & Conflict Brief, 3 Oct 2026\. 24 items reported on 3 Oct 2026 \(UTC\)\./);
    const plain = buildGlobeViewProvenance(input({ featured: null, template: null }));
    expect(altTextFor(plain, { fit: 'planet', keyLayers: null })).toMatch(/^War & Conflict on the globe\./);
    const nothing = buildGlobeViewProvenance(input({ featured: null, template: null, layers: [] }));
    expect(altTextFor(nothing, { fit: 'planet', keyLayers: null })).toMatch(/^The globe\./);
  });

  it('heads tonight\'s card with its title and rows, no badge before them', () => {
    const tonight = buildGlobeViewProvenance(input({
      featured: null, template: null,
      frontPage: {
        kind: 'tonight', fromS: 1_791_600_000, untilS: 1_791_643_200, title: 'Raver Watch · tonight from 10 Oct 2026 02:40Z',
        lines: ['12 scene events start in the twelve hours from 02:40Z'], count: 12, underHeat: 0, underWay: 0, regions: [],
      },
    }));
    expect(altTextFor(tonight, { fit: 'planet', keyLayers: null })).toMatch(/^Raver Watch, tonight from 10 Oct 2026 02:40Z\. 12 scene events start in the twelve hours from 02:40Z\./);
  });

  it(`stays within ${ALT_TEXT_MAX} characters by dropping facts from the end, never a caveat`, () => {
    const p = buildGlobeViewProvenance(input({
      featured: { id: 'x', title: TITLE, lines: Array.from({ length: 30 }, (_, i) => `Fact ${i} ${'x'.repeat(80)}`) },
    }));
    const alt = altTextFor(p, { fit: 'view', keyLayers: null });
    expect(alt.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(alt).toContain('Fact 0');
    expect(alt).not.toContain('Fact 29');
    for (const caveat of p.caveatsShort) expect(alt).toContain(caveat);
  });
});

describe('a card with country names, in words (decision K5, TS10)', () => {
  it('says the picture has them, and a card without says nothing of them', () => {
    const appearance = { skin: 'Blue Marble', lightMode: 'sun' as const };
    const named = altTextFor(buildGlobeViewProvenance(input({ appearance: { ...appearance, countryNames: { codes: ['AFG'], source: 'Natural Earth' } } })), { fit: 'view', keyLayers: null });
    expect(named).toMatch(/, with country names\./);
    const plain = altTextFor(buildGlobeViewProvenance(input({ appearance })), { fit: 'view', keyLayers: null });
    expect(plain).not.toMatch(/country names/);
  });
});
