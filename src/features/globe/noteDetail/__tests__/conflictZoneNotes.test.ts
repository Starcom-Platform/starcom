/**
 * What a click on a Conflict Zones mark opens (critique C5, D-CT's open list). A country's armed-conflict tally
 * opens its events, newest first, each as GDELT coded it from one report, with the report. A displacement ring
 * opens UNHCR's figures for the country, by country of asylum, with the row they came from.
 */
import { describe, it, expect } from 'vitest';
import { warTallyNoteSet, displacementNoteSet, WAR_NOTES_SHOWN } from '../conflictZoneNotes';
import type { RealGdeltEvent } from '../../../../services/geopolitical/gdeltEventExport';
import type { CountryDisplacement } from '../../../../services/geopolitical/UNHCRDisplacementService';

const ev = (over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id: 'g-1', actor1ISO3: 'SDN', actor2ISO3: 'SSD', eventCode: '193', eventRootCode: '19', goldsteinScale: -10,
  lat: 15, lng: 30, sourceUrl: 'https://news.example/sudan-clash', dateAdded: '20261016084500', ...over,
});

describe('warTallyNoteSet', () => {
  it('opens a country\'s events, newest first, each in CAMEO\'s words and with its report', () => {
    const set = warTallyNoteSet('SDN', [ev({ id: 'old', dateAdded: '20261015000000' }), ev({ id: 'new' })]);
    expect(set.heading).toBe('Conflict Zones · SDN');
    expect(set.notes.map((n) => n.id)).toEqual(['new', 'old']);
    const note = set.notes[0];
    expect(note).toMatchObject({
      kind: 'GDELT event, coded from the news', title: 'SDN and SSD: Fight with small arms and light weapons',
      timeMs: Date.UTC(2026, 9, 16, 8, 45, 0), sources: ['https://news.example/sudan-clash'],
    });
    expect(note.text).toContain('CAMEO 193: “Fight with small arms and light weapons”');
    expect(note.text).toContain('Goldstein -10 on a scale of −10 to +10');
    expect(note.text).toContain('Goldstein scores the type of event, not the event itself.');
    expect(note.text).toContain('Machine coding can mistake who did what to whom.');
  });

  it('gives a four-digit code its kind, and says what GDELT counted', () => {
    const note = warTallyNoteSet('SDN', [ev({ eventCode: '1712', eventRootCode: '17', sources: 3, confidence: 60, lead: true, placeName: 'Khartoum, Sudan' })]).notes[0];
    expect(note.text).toContain('CAMEO 1712: “Destroy property”, a kind of 171: “Seize or damage property, not specified below”');
    expect(note.text).toContain('Its story was told by 3 outlets');
    expect(note.text).toContain('Coder\'s confidence 60%');
    expect(note.text).toContain('In a lead paragraph');
    expect(note.text).toContain('Where the report puts it: Khartoum, Sudan');
  });

  it('shows the newest few of a long tally, and says how many there are', () => {
    const many = Array.from({ length: WAR_NOTES_SHOWN + 5 }, (_, i) => ev({ id: `e${i}`, dateAdded: `202610${String(10 + (i % 6)).padStart(2, '0')}0000${String(i % 60).padStart(2, '0')}` }));
    const set = warTallyNoteSet('SDN', many);
    expect(set.notes).toHaveLength(WAR_NOTES_SHOWN);
    expect(set.heading).toBe(`Conflict Zones · SDN, the ${WAR_NOTES_SHOWN} newest of ${WAR_NOTES_SHOWN + 5}`);
  });

  it('links only a web report, and names an unnamed code by its number', () => {
    const note = warTallyNoteSet('SDN', [ev({ eventCode: '1999', sourceUrl: 'javascript:alert(1)' })]).notes[0];
    expect(note.sources).toEqual([]);
    expect(note.title).toBe('SDN and SSD: CAMEO 1999');
  });
});

describe('displacementNoteSet', () => {
  const record: CountryDisplacement = {
    countryISO3: 'DEU', countryName: 'Germany', unhcrCode: 'GFR', idps: 0, refugees: 2655191, asylumSeekers: 412000,
    total: 3067191, year: 2025,
  };

  it('opens UNHCR\'s figures for the country it hosts, with the row they came from', () => {
    const set = displacementNoteSet(record);
    expect(set.heading).toBe('Conflict Zones · Germany');
    const note = set.notes[0];
    expect(note).toMatchObject({ id: 'unhcr-DEU-2025', kind: 'UNHCR population figures', title: 'Germany: 3,067,191 displaced people' });
    expect(note.text.split('\n')).toEqual([
      'Refugees it hosts: 2,655,191', 'Asylum seekers it hosts: 412,000', 'Displaced inside it: 0',
      'UNHCR\'s figures for 2025, by country of asylum.',
    ]);
    expect(note.sources).toEqual(['https://api.unhcr.org/population/v1/population/?yearFrom=2025&yearTo=2025&coa=GFR']);
  });

  it('makes no link without UNHCR\'s own code for the country', () => {
    expect(displacementNoteSet({ ...record, unhcrCode: undefined }).notes[0].sources).toEqual([]);
    expect(displacementNoteSet({ ...record, unhcrCode: 'GF&R' }).notes[0].sources).toEqual([]);
  });
});
