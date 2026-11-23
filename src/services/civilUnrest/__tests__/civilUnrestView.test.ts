/**
 * What Civil Unrest says (decision D-CU): a day of unrest stands on its own day, a crowd count is always beside its
 * claimant, and a surge is always a surge in reporting, not in protest.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { CivilUnrestItem } from '../civilUnrest';
import { byPlace, claimsText, drawnFor, featuredLines, placeHover, standsAt, surgeHover, UNREST_LIVE_DAYS } from '../civilUnrestView';

const DAY = 86_400;
const D25 = Date.UTC(2026, 9, 25) / 1000;
const item = (over: Partial<CivilUnrestItem> = {}): CivilUnrestItem => ({
  id: '30023:pk:starcom-unrest-portal-fr-2026-10-25-x', pubkey: 'pk', d: 'starcom-unrest-portal-fr-2026-10-25-x', eventId: 'e',
  createdAt: D25 + DAY, publishedAt: D25 + DAY, section: 'CivilUnrest', title: 'France: protest on 25 October 2026', content: '',
  day: '2026-10-25', kinds: ['protest'], claims: [], jurisdiction: 'fr', authority: "Wikipedia's Current events portal", licence: 'CC BY-SA 4.0',
  ...over,
});
const surge = (over: Partial<CivilUnrestItem> = {}) => item({
  id: '30023:pk:starcom-intel-surge-protest-it-20261024', d: 'starcom-intel-surge-protest-it-20261024', section: 'ProtestSurges',
  title: 'Reports of protest placed in Italy: 22 articles from 22 outlets on 25 Oct 2026, a surge in reporting, not in protest',
  day: undefined, kinds: [], jurisdiction: 'it', publishedAt: D25 + 12 * 3_600, ...over,
});
const ON = { CivilUnrest: true, ProtestSurges: true };

describe('standsAt', () => {
  it('stands a day of unrest on its own day, live while it is within the last week', () => {
    expect(standsAt(item(), { atS: D25 + 3_600, window: null })).toBe(true);
    expect(standsAt(item(), { atS: D25 + UNREST_LIVE_DAYS * DAY + 3_600, window: null })).toBe(true);
    expect(standsAt(item(), { atS: D25 + (UNREST_LIVE_DAYS + 1) * DAY + 3_600, window: null })).toBe(false);
    expect(standsAt(item(), { atS: D25 - 3_600, window: null })).toBe(false);
  });

  it('within a window, by the day it is about', () => {
    expect(standsAt(item(), { atS: 0, window: { fromS: D25 + 6 * 3_600, untilS: D25 + 8 * 3_600 } })).toBe(true);
    expect(standsAt(item(), { atS: 0, window: { fromS: D25 + DAY, untilS: D25 + 2 * DAY } })).toBe(false);
  });

  it('a surge by when it was written, for two days', () => {
    expect(standsAt(surge(), { atS: D25 + DAY, window: null })).toBe(true);
    expect(standsAt(surge(), { atS: D25 + 3 * DAY, window: null })).toBe(false);
  });
});

describe('drawnFor and byPlace', () => {
  it('draws only the sections on, and gathers a place\'s days under one mark', () => {
    const items = [item(), item({ id: 'b', day: '2026-10-24' }), item({ id: 'c', jurisdiction: undefined, point: { lat: 40.42, lon: -3.7 } }), item({ id: 'd', jurisdiction: undefined }), surge()];
    const drawn = drawnFor(items, { atS: D25 + 3_600, window: null }, { CivilUnrest: true, ProtestSurges: false });
    expect(drawn.map((i) => i.id)).toEqual([items[0].id, 'b', 'c', 'd']);
    const { places, unplaced } = byPlace(drawn);
    expect(places.map((p) => [p.key, p.items.length])).toEqual([['country:fr', 2], ['point:40.42,-3.70', 1]]);
    expect(unplaced.map((i) => i.id)).toEqual(['d']);
    // The surge, once it is written.
    expect(drawnFor(items, { atS: D25 + 13 * 3_600, window: null }, ON).some((i) => i.section === 'ProtestSurges')).toBe(true);
  });
});

describe('the words', () => {
  it('says each crowd count beside its claimant, side by side, never added', () => {
    const counted = item({ claims: [
      { count: 550_000, claimant: 'interior_ministry', claimantName: 'the Interior Ministry', citedBy: 'Le Monde', stated: '550,000' },
      { count: 800_000, claimant: 'organisers', claimantName: 'Organisers', citedBy: 'Organisers', stated: 'more than 800,000' },
    ] });
    expect(claimsText(counted)).toBe('Crowd counts as claimed: 550,000 (the Interior Ministry, as Le Monde reports) · more than 800,000 (Organisers) (separate claims, not added)');
    expect(claimsText(item())).toBe('No crowd count stated');
  });

  it('names a place\'s days, newest first, with who reported them', () => {
    const hover = placeHover([item({ movement: { name: '2026 French student protests' } })], 'France');
    expect(hover).toBe("Civil Unrest · France\n25 Oct 2026: protest (2026 French student protests)\n  No crowd count stated. Reported by Wikipedia's Current events portal");
  });

  it('says a surge is a surge in reporting, not in protest, in its hover and on its card', () => {
    expect(surgeHover([surge()], 'Italy')).toMatch(/A surge in reporting, not in protest\.$/);
    expect(featuredLines(surge(), 'About Italy as a whole')[0]).toBe('Protest surge · a surge in reporting, not in protest');
  });

  it('gives a featured day its kinds, its counts, where, and who reported it under which licence', () => {
    expect(featuredLines(item(), 'About France as a whole')).toEqual([
      'Civil Unrest · protest · 25 Oct 2026',
      'No crowd count stated',
      'About France as a whole',
      "Reported by Wikipedia's Current events portal (CC BY-SA 4.0)",
    ]);
  });
});
