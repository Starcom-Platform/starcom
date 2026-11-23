/**
 * Civil Unrest, as Mecha Jono's protest desk posts it (decision D-CU; their 19 Oct note): a day of unrest in a
 * country, at its city where it names one, each crowd count beside its claimant; and protest surges apart, a surge in
 * reporting, not in protest.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { CivilUnrestStore, readCivilUnrestNote } from '../civilUnrest';

const MJ = MECHA_JONO_KEYS[0];
const note = (tags: string[][], over: Partial<Event> = {}): Event => ({
  id: 'a'.repeat(64), kind: 30023, pubkey: MJ, created_at: 1_793_001_645, content: '', sig: '', tags, ...over,
});
const unrest = (extra: string[][] = []) => note([
  ['d', 'starcom-unrest-portal-es-2026-10-25-556d68be'],
  ['title', 'Spain: protest on 25 October 2026 (Wikipedia portal, citing Reuters)'],
  ['summary', "Wikipedia's Current events portal for 25 October 2026 reports a protest in Spain."],
  ['published_at', '1793001645'], ['client', 'Mecha Jono'],
  ['t', 'intel_report'], ['t', 'unrest_note'], ['t', 'unrest_desk'], ['t', 'source:portal'], ['t', 'category:unrest.events'],
  ['authority', 'wikipedia', "Wikipedia's Current events portal"],
  ['unrest_kind', 'protest'], ['t', 'unrest:protest'],
  ['jurisdiction', 'es'], ['t', 'starcom_intel'],
  ['r', 'https://en.wikipedia.org/wiki/Portal%3ACurrent_events/2026_October_25'],
  ['license', 'CC BY-SA 4.0'],
  ...extra,
]);
const surge = (extra: string[][] = []) => note([
  ['d', 'starcom-intel-surge-protest-it-20261024'],
  ['title', 'Reports of protest placed in Italy: 22 articles from 22 outlets on 25 Oct 2026, a surge in reporting, not in protest'],
  ['published_at', '1792990000'],
  ['t', 'intel_report'], ['t', 'reporting_surge'], ['t', 'protest'], ['t', 'starcom_intel'],
  ['jurisdiction', 'it'], ['r', 'https://www.gdeltproject.org/'],
  ...extra,
]);

describe('readCivilUnrestNote: a day of unrest', () => {
  it('reads its country, its day from its address, its kinds, who reported it and its licence', () => {
    const read = readCivilUnrestNote(unrest());
    expect(read).toMatchObject({
      section: 'CivilUnrest', d: 'starcom-unrest-portal-es-2026-10-25-556d68be', jurisdiction: 'es', day: '2026-10-25',
      kinds: ['protest'], authority: "Wikipedia's Current events portal", licence: 'CC BY-SA 4.0', claims: [],
      url: 'https://en.wikipedia.org/wiki/Portal%3ACurrent_events/2026_October_25', retracted: false,
    });
  });

  it('places it at the city it names, as the note gives it', () => {
    const read = readCivilUnrestNote(unrest([['place', 'Madrid', 'city'], ['geo', 'lat:40.4200,lon:-3.7000'], ['geo_precision', 'city'], ['geo_kind', 'event_location']]));
    expect(read).toMatchObject({ point: { lat: 40.42, lon: -3.7 }, precision: 'city', placeName: 'Madrid' });
  });

  it('keeps every crowd count beside its claimant, as stated, never one as fact', () => {
    const read = readCivilUnrestNote(unrest([
      ['claim', '550000', 'interior_ministry', 'the Interior Ministry', 'Le Monde', '550,000'],
      ['claim', '800000', 'organisers', 'Organisers', 'Le Monde', 'more than 800,000'],
      ['claim', 'many', 'organisers', 'Organisers', 'X', 'many'],
    ]));
    expect('refused' in read ? [] : read.claims).toEqual([
      { count: 550000, claimant: 'interior_ministry', claimantName: 'the Interior Ministry', citedBy: 'Le Monde', stated: '550,000' },
      { count: 800000, claimant: 'organisers', claimantName: 'Organisers', citedBy: 'Le Monde', stated: 'more than 800,000' },
    ]);
  });

  it('names the movement a note names', () => {
    expect(readCivilUnrestNote(unrest([['movement', 'Q141615137', '2026 French student protests']])))
      .toMatchObject({ movement: { wikidata: 'Q141615137', name: '2026 French student protests' } });
  });

  it('refuses another publisher, another desk, or a note without its address or title', () => {
    expect(readCivilUnrestNote({ ...unrest(), pubkey: 'f'.repeat(64) })).toMatchObject({ refused: expect.any(String) });
    expect(readCivilUnrestNote(note([['d', 'x'], ['title', 't'], ['t', 'intel_report']]))).toMatchObject({ refused: expect.any(String) });
    expect(readCivilUnrestNote(note(unrest().tags.filter((t) => t[0] !== 'title')))).toMatchObject({ refused: expect.any(String) });
  });
});

describe('readCivilUnrestNote: a protest surge', () => {
  it('is its own section, a surge in reporting, timed by when it was written', () => {
    const read = readCivilUnrestNote(surge());
    expect(read).toMatchObject({ section: 'ProtestSurges', jurisdiction: 'it', publishedAt: 1_792_990_000 });
    expect('refused' in read ? null : read.day).toBeUndefined();
  });

  it('is not a protest surge without t=protest: a conflict surge stays an Intel Report', () => {
    expect(readCivilUnrestNote(note(surge().tags.filter((t) => t[1] !== 'protest')))).toMatchObject({ refused: expect.any(String) });
  });
});

describe('CivilUnrestStore', () => {
  it('keeps the newest at an address, and lets a retraction withdraw it', () => {
    const store = new CivilUnrestStore();
    store.accept(unrest([['place', 'Old', 'city']]));
    store.accept({ ...unrest([['place', 'Madrid', 'city']]), id: 'b'.repeat(64), created_at: 1_793_001_700 });
    expect(store.items().map((i) => i.placeName)).toEqual(['Madrid']);
    store.accept({ ...unrest([['t', 'retracted']]), id: 'c'.repeat(64), created_at: 1_793_001_800 });
    expect(store.items()).toEqual([]);
  });
});

describe('the live desk, as kept on 26 Oct (civil-unrest/unrest_live_2026-10-26.json)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LIVE: Event[] = JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/civil-unrest/unrest_live_2026-10-26.json'), 'utf8'));
  const reads = LIVE.map((e) => readCivilUnrestNote(e));
  const items = reads.filter((r): r is Exclude<typeof r, { refused: string }> => !('refused' in r));

  it('reads every day of unrest and every protest surge, and refuses a conflict surge', () => {
    const refused = reads.filter((r) => 'refused' in r);
    expect(refused).toHaveLength(LIVE.filter((e) => e.tags.some((t) => t[1] === 'reporting_surge') && !e.tags.some((t) => t[0] === 't' && t[1] === 'protest')).length);
    expect(items.filter((i) => i.section === 'ProtestSurges').length).toBeGreaterThan(0);
  });

  it('gives each day of unrest its country and its day, and each claim its claimant', () => {
    for (const item of items.filter((i) => i.section === 'CivilUnrest')) {
      expect(item.jurisdiction ?? item.point, item.d).toBeTruthy();
      expect(item.day, item.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const claim of item.claims) {
        expect(claim.count, item.d).toBeGreaterThan(0);
        expect(claim.claimantName, item.d).toBeTruthy();
      }
    }
    expect(items.some((i) => i.claims.length >= 1)).toBe(true);
    expect(items.some((i) => i.point && i.placeName)).toBe(true);
  });
});

describe('the publisher\'s own desk is credited to nobody (the operator, 24 Oct; record D-L)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LIVE: Event[] = JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/civil-unrest/unrest_live_2026-10-26.json'), 'utf8'));

  it('names no reporter where the note\'s authority is its own client, and keeps every other reporter', () => {
    const own = LIVE.find((e) => e.tags.some((t) => t[0] === 'authority' && t[2]?.includes(e.tags.find((c) => c[0] === 'client')?.[1] ?? '\u0000')))!;
    expect(own).toBeTruthy();
    const read = readCivilUnrestNote(own);
    expect('refused' in read ? 'refused' : read.authority).toBeUndefined();
    expect(readCivilUnrestNote(unrest())).toMatchObject({ authority: "Wikipedia's Current events portal" });
  });

  it('prints no note\'s own client on its card, for every note on the live desk', async () => {
    const { featuredLines, placeHover } = await import('../civilUnrestView');
    for (const event of LIVE) {
      const read = readCivilUnrestNote(event);
      if ('refused' in read) continue;
      const client = event.tags.find((t) => t[0] === 'client')?.[1];
      if (!client) continue;
      expect([...featuredLines(read, 'there'), placeHover([read], 'there')].join('\n'), read.d).not.toContain(client);
    }
  });
});
