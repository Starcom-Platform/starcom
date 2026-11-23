/**
 * Raver Watch v1.2, read (Mecha Jono's update of 2026-10-02, kept beside the
 * record in RAVER_WATCH_V1_1.md and its vectors, which v1.2 extends).
 *
 * v1.2 is additive. A scene event at a public, licensed venue names the venue
 * and its address and gives its point to about 150 m (`geo_precision` venue),
 * crediting OpenStreetMap, whose venue it is. The owner decided on 2026-10-02
 * to draw such an event at the venue: only a public venue, only a scene event;
 * every other point stays at 0.1° (RW3, as amended by RW12). And HeatRisk is
 * live: the National Weather Service's 0-4 for a town with a rave that week,
 * from Orange (2) up, drawn at the town.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readRaverWatchNote } from '../raverWatch';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/raver-watch');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const VECTORS: Array<{ name: string; event: Partial<Event> }> = JSON.parse(readFileSync(resolve(KEPT, 'raver_watch_v1_1_vectors.json'), 'utf8'));
const vector = (name: string, over: Partial<Event> = {}): Event => {
  const found = VECTORS.find((v) => v.name === name);
  if (!found) throw new Error(`no vector named "${name}"`);
  return { id: 'e'.repeat(64), sig: 's'.repeat(128), ...found.event, ...over } as Event;
};
const VENUE = 'a scene event at a public venue (v1.2)';
const HEAT = 'heat risk at an event town (v1.2)';
const TOWN_EVENT = 'an upcoming scene event';
const LAB = 'a red lab warning, drawn at its city';
const retag = (event: Event, change: (tags: string[][]) => string[][]): Event => ({ ...event, tags: change(event.tags) });
const setTag = (name: string, value: string) => (tags: string[][]) => [...tags.filter((t) => t[0] !== name), [name, value]];

describe('Raver Watch v1.2: their two new vectors, read as they expect', () => {
  it('has their two v1.2 vectors after the seven', () => {
    expect(VECTORS.map((v) => v.name).slice(7)).toEqual([VENUE, HEAT]);
  });

  it('a scene event at a public venue: placed at the venue, to about 150 m, named with its address and credited', () => {
    expect(readRaverWatchNote(vector(VENUE))).toMatchObject({
      id: `31923:${MECHA}:raver-scene-event-19hz-public-venue-example`,
      layer: 'SceneEvents',
      precision: 'venue',
      // Their geo is 37.7689, -122.4199: kept to 0.001°, about the 150 m they state.
      point: { lat: 37.769, lon: -122.42 },
      venue: 'Public Works',
      location: 'Public Works, 161 Erie Street, San Francisco, CA',
      license: 'ODbL-1.0 (venue: OpenStreetMap contributors)',
      genres: ['disco', 'funk', 'house'],
    });
  });

  it('heat risk at an event town: HeatRisk, its 0-4 kept, its level and town as stated', () => {
    expect(readRaverWatchNote(vector(HEAT))).toMatchObject({
      id: `30023:${MECHA}:raver-heat-risk-ca-costa-mesa-2026-10-03`,
      layer: 'HeatRisk',
      level: 'red',
      heatRisk: 3,
      category: 'heat',
      jurisdiction: 'us-ca',
      point: { lat: 33.6, lon: -117.9 },
      precision: 'city',
      validUntil: 1_791_118_800,
    });
  });
});

describe('Raver Watch v1.2: a point finer than a town only where the owner allowed it', () => {
  it('a venue point is placed by its geohash, to 0.001°, when it gives no geo', () => {
    const note = readRaverWatchNote(retag(vector(VENUE), (tags) => tags.filter((t) => t[0] !== 'geo')));
    expect(note).toMatchObject({ precision: 'venue' });
    const { point } = note as { point: { lat: number; lon: number } };
    expect(Math.abs(point.lat - 37.769)).toBeLessThan(0.002);
    expect(Math.abs(point.lon + 122.42)).toBeLessThan(0.002);
    expect(Math.round(point.lat * 1000)).toBe(point.lat * 1000);
  });

  it('a scene event that says venue but names none stays at its town', () => {
    const note = readRaverWatchNote(retag(vector(VENUE), (tags) => tags.filter((t) => t[0] !== 'venue')));
    expect(note).toMatchObject({ point: { lat: 37.8, lon: -122.4 } });
    expect(note).not.toHaveProperty('precision');
    expect(note).not.toHaveProperty('venue');
  });

  it('any other layer that says venue stays at its town: venues are for scene events only', () => {
    const note = readRaverWatchNote(retag(vector(LAB), (tags) => setTag('venue', 'A club')(setTag('geo_precision', 'venue')(setTag('geo', 'lat:48.2081,lon:16.3713')(tags)))));
    expect(note).toMatchObject({ layer: 'DrugCheckAlerts', point: { lat: 48.2, lon: 16.4 } });
    expect(note).not.toHaveProperty('precision');
    expect(note).not.toHaveProperty('venue');
  });

  it('a scene event at its town is placed at 0.1°, as before, and names no venue', () => {
    const note = readRaverWatchNote(vector(TOWN_EVENT));
    expect(note).toMatchObject({ precision: 'city', point: { lat: 37.8, lon: -122.4 } });
    expect(note).not.toHaveProperty('venue');
  });
});

describe('Raver Watch v1.2: the heat level, and only a real one', () => {
  it('keeps 0 to 4, whole', () => {
    for (const level of ['0', '1', '2', '3', '4']) {
      expect(readRaverWatchNote(retag(vector(HEAT), setTag('heat_risk', level))), level).toMatchObject({ heatRisk: Number(level) });
    }
  });

  it('drops anything else, and keeps the note', () => {
    for (const bad of ['5', '-1', '2.5', 'red', '', '03']) {
      const note = readRaverWatchNote(retag(vector(HEAT), setTag('heat_risk', bad)));
      expect(note, bad).toMatchObject({ layer: 'HeatRisk' });
      expect(note, bad).not.toHaveProperty('heatRisk');
    }
  });

  it('reads a heat level only on HeatRisk', () => {
    expect(readRaverWatchNote(retag(vector(LAB), setTag('heat_risk', '3')))).not.toHaveProperty('heatRisk');
  });
});
