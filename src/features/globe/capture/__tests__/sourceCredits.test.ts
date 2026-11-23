/**
 * Credit for each data source, as its terms ask (record D-L, decision L5): a
 * "Data:" line on every card naming each source drawn, its licence where one
 * is required, and the key linking each.
 */
import { describe, it, expect } from 'vitest';
import { CREDITS, creditLine, creditsParagraph, creditsShown, groupedLicences, imageryShown, threatListCredits } from '../sourceCredits';
import { IMAGERY } from '../../../../globe-engine/imagery';
import { THREAT_SOURCES } from '../../../../services/CyberAttacks/threatSources';
import type { FeedProvenance } from '../shareCardProvenance';

const loaded = (name: string, credits: FeedProvenance['credits'], more: Partial<FeedProvenance> = {}): FeedProvenance =>
  ({ name, lastUpdated: '2026-10-05T21:00:00Z', credits, ...more });

describe('the credits', () => {
  it('give every source words, a link, and the licence where the terms name one', () => {
    for (const [id, c] of Object.entries(CREDITS)) {
      expect(c.text.trim(), id).not.toBe('');
      if (c.url) expect(c.url, id).toMatch(/^https:\/\//);
      if (c.licence) expect(c.licence.url, id).toMatch(/^https:\/\/(creativecommons\.org|opendatacommons\.org)\/licenses\//);
    }
  });

  it('say what each licence asks, in its own words where it gives them', () => {
    expect(CREDITS.openMeteo.keyText).toBe('Weather data by Open-Meteo.com');
    expect(creditLine(CREDITS.cables)).toBe('TeleGeography, 2022 (CC BY-NC-SA 3.0)');
    expect(creditLine(CREDITS.dshield)).toBe('SANS Technology Institute, Internet Storm Center (CC BY-NC-SA 4.0)');
    expect(CREDITS.gdelt.url).toBe('https://www.gdeltproject.org/');
    expect(CREDITS.unhcr.url).toBe('https://www.unhcr.org/terms-use-datasets');
    expect(creditLine(CREDITS.wikipediaWars)).toBe("Wikipedia's List of ongoing armed conflicts (CC BY-SA 4.0)");
  });
});

describe('creditsShown: the card\'s Data line', () => {
  it('names each source whose data can be in the picture, once, in the order the feeds come', () => {
    const feeds = [
      loaded('NOAA GFS temperature', [CREDITS.noaaGfs]),
      loaded('Open-Meteo weather', [CREDITS.openMeteo, CREDITS.nasaEonet]),
      loaded('NOAA GFS again', [CREDITS.noaaGfs]),
    ];
    expect(creditsShown(feeds)).toEqual(['NOAA GFS', 'Open-Meteo.com (CC BY 4.0)', 'NASA EONET']);
  });

  it('credits data that arrived without a time, and nothing that failed, never loaded, or does not report', () => {
    const feeds = [
      loaded('Cables', [CREDITS.cables], { lastUpdated: null, timestamped: false }),
      loaded('Failed', [CREDITS.gdelt], { error: 'HTTP 503' }),
      loaded('Never loaded', [CREDITS.unhcr], { lastUpdated: null }),
      loaded('Unreported', [CREDITS.celestrak], { unreported: true }),
      { name: 'No credit given', lastUpdated: '2026-10-05T21:00:00Z' },
    ];
    expect(creditsShown(feeds)).toEqual(['TeleGeography, 2022 (CC BY-NC-SA 3.0)']);
  });
});

describe('threatListCredits', () => {
  it('credits each list drawn by its own provider, and FireHOL for the lists its mirror served', () => {
    expect(threatListCredits(THREAT_SOURCES).map(creditLine)).toEqual([
      'blocklist.de', 'FireHOL blocklist-ipsets', 'Spamhaus DROP',
      'SANS Technology Institute, Internet Storm Center (CC BY-NC-SA 4.0)', 'ThreatFox (abuse.ch)',
    ]);
  });

  it('credits no list that was not drawn', () => {
    const drawn = THREAT_SOURCES.filter((s) => s.label.startsWith('ThreatFox'));
    expect(threatListCredits(drawn).map(creditLine)).toEqual(['ThreatFox (abuse.ch)']);
  });
});

describe('imagery after the data (decisions TX8, TX10)', () => {
  it('names each maker once, as a card prints it, in the order drawn', () => {
    expect(imageryShown([
      IMAGERY.earthDark.source, IMAGERY.earthWater.source, IMAGERY.earthNight.source, IMAGERY.clouds.source,
    ])).toEqual(['Google Data Arts Team (Apache 2.0)', 'NASA', 'Solar System Scope (CC BY 4.0)']);
    expect(imageryShown([])).toEqual([]);
  });

  it('joins the data and the imagery into one paragraph, the data unchanged when there is no imagery', () => {
    expect(creditsParagraph(['NOAA GFS', 'RainViewer'], ['Solar System Scope (CC BY 4.0)', 'NASA']))
      .toBe('Data: NOAA GFS · RainViewer. Imagery: Solar System Scope (CC BY 4.0) · NASA');
    expect(creditsParagraph(['NOAA GFS', 'RainViewer'])).toBe('Data: NOAA GFS · RainViewer');
    expect(creditsParagraph([], ['NASA'])).toBe('Imagery: NASA');
    expect(creditsParagraph([], [])).toBeNull();
  });
});

describe('the names a card draws, credited (decision K5, TS14)', () => {
  it('come between the data and the imagery on one line', () => {
    expect(creditsParagraph(['NOAA GFS'], ['NASA'], ['Natural Earth'])).toBe('Data: NOAA GFS. Names: Natural Earth. Imagery: NASA');
    expect(creditsParagraph([], [], ['Natural Earth'])).toBe('Names: Natural Earth');
    expect(creditsParagraph(['NOAA GFS'], ['NASA'])).toBe('Data: NOAA GFS. Imagery: NASA');
  });

  it('name Natural Earth, and the credits list it', () => {
    expect(creditLine(CREDITS.naturalEarth)).toBe('Natural Earth');
    expect(CREDITS.naturalEarth.url).toMatch(/naturalearthdata\.com/);
  });
});

// The licences of the notes in a card's picture (Interchange 3.25; the owner's pick of 26 Oct): each once, a platform's producers on one.
describe('groupedLicences', () => {
  const office = (name: string, day = '2026-10-23') => `Licence Ouverte 2.0 (Etalab) (DATAtourisme, from ${name}, last updated ${day})`;

  it('names each licence once, in the order met', () => {
    expect(groupedLicences(['CC BY 4.0', 'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))', 'CC BY 4.0']))
      .toEqual(['CC BY 4.0', 'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))']);
  });

  it('names a platform\'s producers on one credit, under its licence, their dates left to the record', () => {
    expect(groupedLicences([office('OT BOURGES'), 'CC BY 4.0', office('ADT 79', '2026-10-21'), office('OT BOURGES', '2026-10-22')]))
      .toEqual(['DATAtourisme, Licence Ouverte 2.0 (Etalab): OT BOURGES, ADT 79', 'CC BY 4.0']);
  });

  it('names eight producers on a card and counts the rest, whose names and days are in its record (the owner, 26 Oct)', () => {
    const offices = Array.from({ length: 11 }, (_, i) => office(`OT ${i + 1}`));
    expect(groupedLicences(offices)).toEqual([
      'DATAtourisme, Licence Ouverte 2.0 (Etalab): OT 1, OT 2, OT 3, OT 4, OT 5, OT 6, OT 7, OT 8 and 3 more, each named with its day in this card\'s record',
    ]);
    expect(groupedLicences(offices.slice(0, 8))[0]).toMatch(/: OT 1, .*, OT 8$/);
  });

  it('leaves a licence whole that does not follow the pattern, and is empty for none', () => {
    expect(groupedLicences(['ODbL-1.0 (venue: OpenStreetMap contributors)'])).toEqual(['ODbL-1.0 (venue: OpenStreetMap contributors)']);
    expect(groupedLicences([])).toEqual([]);
  });
});
