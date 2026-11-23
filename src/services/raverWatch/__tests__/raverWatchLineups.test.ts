/**
 * Line-ups and festivals (raver-nights.md, RN13), and the tags no publisher
 * sends (RN12; the owner, 2026-10-18).
 *
 * Mecha Jono's scene events and scene news name who is playing in `artist` tags,
 * `["artist", name, MusicBrainz id]`, only for performers MusicBrainz knows as
 * electronic artists, the id empty when the name is ambiguous; scene news names
 * a festival as `["festival", name, Wikidata QID, country]`. "Line-ups are
 * promotion, and the `artist` tag is the whole of what may be shown": a hover
 * and a card say the names and nothing else, up to four and then how many more.
 *
 * `raver_mission` and `harm_reduction_site` are not theirs (Raver missions are
 * Hero Watch's field missions, and no site is posted), nor is `level` info:
 * a note naming only those is refused, and counted as a kind no layer reads.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readRaverWatchNote, unreadKindOf, type RaverWatchItem } from '../raverWatch';
import { describeItem, lineupText, festivalText } from '../raverWatchView';
import { featuredRaverWatchFor } from '../../../features/globe/capture/raverWatchReports';

const MECHA = 'f'.repeat(64);
const MB = 'a933a8ba-54b3-42d8-b2d8-a5fc5405d015';
const sceneEvent = (extra: string[][]): Event => ({
  id: 'e'.repeat(64), sig: 's'.repeat(128), pubkey: MECHA, kind: 31923, created_at: 1_790_988_520, content: 'Psy dub at Terminal West.',
  tags: [
    ['d', 'raver-scene-event-19hz-54680bec10cd2d95'], ['title', 'Psy dub, downtempo and house at Terminal West, Atlanta, GA'],
    ['start', '1790985600'], ['end', '1791007200'], ['start_tzid', 'America/New_York'], ['location', 'Atlanta, GA'],
    ['geo', 'lat:33.7815,lon:-84.4154'], ['geo_precision', 'city'], ['jurisdiction', 'us-ga'],
    ['t', 'raver_watch'], ['t', 'scene_event'], ['valid_from', '1790988520'], ['valid_until', '1791007200'], ['source', '19hz.info'],
    ...extra,
  ],
});
const note = (layerTag: string, extra: string[][] = []): Event => ({
  id: 'e'.repeat(64), sig: 's'.repeat(128), pubkey: MECHA, kind: 30023, created_at: 1_790_988_520, content: 'Words.',
  tags: [
    ['d', `raver-${layerTag}-1`], ['title', 'A note'], ['t', 'raver_watch'], ['t', layerTag],
    ['valid_from', '1790988520'], ['valid_until', '1791007200'], ['source', 'Somewhere'], ['jurisdiction', 'be'], ...extra,
  ],
});
const read = (event: Event) => readRaverWatchNote(event, [MECHA]);

describe('who is playing', () => {
  it('reads a scene event\'s artist tags, in order, with the MusicBrainz id when there is one', () => {
    expect(read(sceneEvent([['artist', 'Desert Dwellers', MB], ['t', 'artist:desert-dwellers'], ['artist', 'Kalya Scintilla', '']])))
      .toMatchObject({ lineup: [{ name: 'Desert Dwellers', musicbrainz: MB }, { name: 'Kalya Scintilla' }] });
  });

  it('keeps no id that is not one, no blank name, and each name once', () => {
    const got = read(sceneEvent([['artist', '  '], ['artist', 'Bloom', 'not-an-id'], ['artist', 'Bloom', MB]]));
    expect(got).toMatchObject({ lineup: [{ name: 'Bloom' }] });
    expect((got as RaverWatchItem).lineup?.[0]).not.toHaveProperty('musicbrainz');
  });

  it('says nothing of a line-up when none is named', () => {
    expect(read(sceneEvent([]))).not.toHaveProperty('lineup');
  });

  it('reads artists on scene news too, and on no other kind', () => {
    expect(read(note('scene_news', [['artist', 'Eric Prydz', '35dac7d2-0b1f-470f-9a5a-c53c8821f6d6']]))).toMatchObject({ lineup: [{ name: 'Eric Prydz' }] });
    expect(read(note('drug_check_alert', [['level', 'red'], ['artist', 'Eric Prydz', '']]))).not.toHaveProperty('lineup');
  });
});

describe('festivals', () => {
  it('reads a scene-news note\'s festival tags: name, Wikidata QID and country', () => {
    expect(read(note('scene_news', [['festival', 'Tomorrowland', 'Q1059487', 'BE'], ['t', 'festival:tomorrowland']])))
      .toMatchObject({ festivals: [{ name: 'Tomorrowland', wikidata: 'Q1059487', country: 'be' }] });
  });

  it('keeps the name when the QID or the country is not one', () => {
    const got = read(note('scene_news', [['festival', 'Dekmantel', 'nope', 'Netherlands']])) as RaverWatchItem;
    expect(got.festivals).toEqual([{ name: 'Dekmantel' }]);
  });
});

describe('what a hover and a card say', () => {
  it('names up to four, then how many more', () => {
    expect(lineupText([{ name: 'A' }])).toBe('Playing: A');
    expect(lineupText(['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name })))).toBe('Playing: A, B, C, D and 2 more');
    expect(festivalText([{ name: 'Tomorrowland', country: 'be' }])).toBe('Festival: Tomorrowland (BE)');
    expect(festivalText([{ name: 'Dekmantel' }, { name: 'Sónar', country: 'es' }])).toBe('Festivals: Dekmantel, Sónar (ES)');
  });

  it('a scene event\'s hover and card say who is playing', () => {
    const event = read(sceneEvent([['artist', 'Desert Dwellers', MB]])) as RaverWatchItem;
    expect(describeItem(event, () => null)).toContain('Playing: Desert Dwellers.');
    expect(featuredRaverWatchFor(event, () => null)?.lines).toContain('Playing: Desert Dwellers');
  });

  it('a scene event with no line-up says nothing of one', () => {
    const event = read(sceneEvent([])) as RaverWatchItem;
    expect(describeItem(event, () => null)).not.toContain('Playing');
    expect(featuredRaverWatchFor(event, () => null)?.lines.join('\n')).not.toContain('Playing');
  });
});

describe('tags no publisher sends (RN12)', () => {
  it('refuses a note naming only raver_mission or harm_reduction_site, and counts its kind', () => {
    for (const kind of ['raver_mission', 'harm_reduction_site']) {
      expect(read(note(kind))).toEqual({ refused: 'it names no Raver Watch layer' });
      expect(unreadKindOf(note(kind))).toBe(kind);
    }
  });

  it('takes no level info: red and amber are their levels', () => {
    expect(read(note('drug_check_alert', [['level', 'info']]))).not.toHaveProperty('level');
    expect(read(note('drug_check_alert', [['level', 'amber']]))).toMatchObject({ level: 'amber' });
  });
});
