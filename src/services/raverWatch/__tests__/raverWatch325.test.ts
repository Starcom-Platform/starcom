/**
 * What Interchange 3.25 changed in Raver Watch (Mecha Jono, 25 Oct; plan H11): a scene event with no start time,
 * `time_precision: "day"`, shown as "all day" on its own day in its own zone, never as a clock time; the festival a
 * scene event names, said; and the licence a note carries, credited on the note.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readRaverWatchNote, type RaverWatchItem } from '../raverWatch';
import { describeItem, tonightLines, tonightOf } from '../raverWatchView';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/raver-watch');
const VECTORS: Array<{ name: string; event: Partial<Event> }> = JSON.parse(readFileSync(resolve(KEPT, 'raver_watch_v1_1_vectors.json'), 'utf8'));
const vector = (name: string): Event => ({ id: 'e'.repeat(64), sig: 's'.repeat(128), ...VECTORS.find((v) => v.name === name)!.event } as Event);
const withTag = (event: Event, tag: string[]): Event => ({ ...event, tags: [...event.tags, tag] });

// Paris, 3 Nov 2026: CET, so its day runs from 23:00Z on the 2nd.
const PARIS_DAY = Date.UTC(2026, 10, 2, 23) / 1000;
const DAY = 86_400;
const allDay = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '31923:pk:raver-scene-event-paris', pubkey: 'pk', d: 'raver-scene-event-paris', eventId: 'e', createdAt: 1, layer: 'SceneEvents',
  title: 'Music festival in Paris', source: 'Que faire à Paris', validFrom: PARIS_DAY - 14 * DAY, validUntil: PARIS_DAY + DAY,
  start: PARIS_DAY, end: PARIS_DAY + DAY, startTzid: 'Europe/Paris', location: 'Paris', allDay: true, cancelled: false,
  point: { lat: 48.9, lon: 2.3 }, precision: 'city', content: '',
  license: 'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))', ...over,
});

describe('a scene event with no start time (time_precision "day")', () => {
  it('is read as all day, and only on a scene event', () => {
    const event = vector('an upcoming scene event');
    const read = readRaverWatchNote(withTag(event, ['time_precision', 'day']));
    expect('refused' in read ? null : read.allDay).toBe(true);
    const timed = readRaverWatchNote(event);
    expect('refused' in timed ? null : timed.allDay).toBeUndefined();
  });

  it('says its own day in its own zone, all day, and no clock time', () => {
    const said = describeItem(allDay(), () => null);
    expect(said).toContain('Music festival in Paris — Paris, Tue 3 Nov (Europe/Paris), all day.');
    expect(said).not.toMatch(/\d\d:\d\dZ/);
    const festival = describeItem(allDay({ end: PARIS_DAY + 3 * DAY }), () => null);
    expect(festival).toContain('Tue 3 Nov to Thu 5 Nov (Europe/Paris), all day.');
  });

  it('reads "all day" in tonight\'s row, and "first" only from an event with a start time', () => {
    const lines = (items: RaverWatchItem[]) => tonightLines(tonightOf(items, PARIS_DAY - 3_600));
    expect(lines([allDay()])[1]).toBe('Europe · 1 event · all day');
    // 10:00 in Paris, inside tonight's twelve hours from 22:00Z the night before.
    const timed = allDay({ id: '31923:pk:raver-timed', d: 'raver-timed', allDay: undefined, start: PARIS_DAY + 10 * 3_600, end: PARIS_DAY + 14 * 3_600 });
    expect(lines([allDay(), timed])[1]).toBe('Europe · 2 events · first 10:00 GMT+1');
  });
});

describe('what a scene event names, and what a note carries', () => {
  it('names the festival a scene event is part of', () => {
    expect(describeItem(allDay({ festivals: [{ name: 'Festival d\'Automne', country: 'fr' }] }), () => null)).toContain('Festival: Festival d\'Automne (FR).');
  });

  it('credits the licence a note carries, on the note', () => {
    expect(describeItem(allDay(), () => null)).toContain('Licence: Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr)).');
    const incident = allDay({ layer: 'SceneIncidents', start: undefined, end: undefined, startTzid: undefined, allDay: undefined, license: 'CC BY 4.0' });
    expect(describeItem(incident, () => null)).toContain('Licence: CC BY 4.0.');
  });

  it('credits a public venue once, as OpenStreetMap asks, and not again as a licence', () => {
    const venue = allDay({ allDay: undefined, precision: 'venue', venue: 'Le Bataclan', license: 'ODbL-1.0 (venue: OpenStreetMap contributors)' });
    const said = describeItem(venue, () => null);
    expect(said).toMatch(/OpenStreetMap contributors, ODbL\./);
    expect(said).not.toMatch(/Licence:/);
  });
});
