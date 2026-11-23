/**
 * What a click on an earthquake, a fire, a flood or the rest opens (critique C5, D-CT's open list): the event as its
 * publisher states it, and the publisher's own page for it. Nothing is added: a field the feed left out is left out.
 */
import { describe, it, expect } from 'vitest';
import { ecoDisasterNoteSet } from '../ecoDisasterNote';
import type { NaturalEvent } from '../../../../hooks/useGeoEvents';

const quake: NaturalEvent = {
  id: 'nc75450821', lat: 38.8, lng: -122.8, type: 'earthquake', magnitude: 4.24, status: 'reviewed',
  timestamp: '2026-10-16T14:03:00.000Z', description: 'M 4.2 - 7 km NW of The Geysers, CA', source: 'USGS',
  depthKm: 2.31, tsunami: false, severityBucket: 'minor',
  sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc75450821',
};

describe('ecoDisasterNoteSet', () => {
  it('opens an earthquake as USGS states it, with its event page', () => {
    const set = ecoDisasterNoteSet(quake);
    expect(set.heading).toBe('Earthquake');
    expect(set.notes).toHaveLength(1);
    const note = set.notes[0];
    expect(note).toMatchObject({
      id: 'nc75450821', title: 'M 4.2 - 7 km NW of The Geysers, CA', kind: 'Reported by USGS',
      timeMs: Date.parse('2026-10-16T14:03:00.000Z'),
      sources: ['https://earthquake.usgs.gov/earthquakes/eventpage/nc75450821'],
    });
    expect(note.text.split('\n')).toEqual(['Magnitude 4.2', 'Depth 2.3 km', 'USGS review status: reviewed']);
  });

  it('says what the tsunami flag is, and no more: the flag is not a warning', () => {
    const note = ecoDisasterNoteSet({ ...quake, tsunami: true }).notes[0];
    expect(note.text).toContain('USGS tsunami flag set. For tsunami alerts, see tsunami.gov.');
    expect(note.text).not.toMatch(/warning issued/i);
  });

  it('opens a fire with its burned area, from the agency that reported it', () => {
    const note = ecoDisasterNoteSet({
      id: 'EONET_22614', lat: 35.4, lng: -120, type: 'wildfire', intensity: 2500, timestamp: '2026-08-12T15:36:00Z',
      description: 'Wildfire PLAINS, San Luis Obispo, California', source: 'NASA EONET (IRWIN)', severityBucket: 'minor',
      sourceUrl: 'https://irwin.doi.gov/observer/incidents/2026-CASLU-001',
    }).notes[0];
    expect(note.title).toBe('Wildfire PLAINS, San Luis Obispo, California');
    expect(note.kind).toBe('Reported by NASA EONET (IRWIN)');
    expect(note.text).toBe('Burned area: 2,500 acres');
    expect(note.sources).toEqual(['https://irwin.doi.gov/observer/incidents/2026-CASLU-001']);
  });

  it('opens a GDACS event with its alert level and its report', () => {
    const set = ecoDisasterNoteSet({
      id: 'gdacs-1001335', lat: 18, lng: 130, type: 'hurricane', status: 'Orange', timestamp: '2026-10-16T00:00:00Z',
      description: 'FENGSHEN-26 — Tropical Storm (maximum wind speed of 83 km/h)', source: 'GDACS', severityBucket: 'major',
      sourceUrl: 'https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=38&eventtype=TC',
    });
    expect(set.heading).toBe('Hurricane');
    expect(set.notes[0].text).toBe('GDACS alert level: Orange');
    expect(set.notes[0].sources).toEqual(['https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=38&eventtype=TC']);
  });

  it('leaves out what the feed did not state, and says nothing about a source it has no page for', () => {
    const note = ecoDisasterNoteSet({
      id: 7, lat: 0, lng: 0, type: 'earthquake', source: 'USGS', severityBucket: 'minor',
    }).notes[0];
    expect(note.id).toBe('7');
    expect(note.text).toBe('');
    expect(note.timeMs).toBeNull();
    expect(note.sources).toEqual([]);
    // No description: the mark's own label stands as the title.
    expect(note.title).toBe('earthquake');
  });

  it('says plainly when an event is mock data', () => {
    const note = ecoDisasterNoteSet({
      id: 'v1', lat: 0, lng: 0, type: 'volcano', description: 'Etna', source: 'volcano-mock', isMock: true, severityBucket: 'minor',
    }).notes[0];
    expect(note.kind).toBe('Mock data, not a real event');
  });

  it('does not read a time it cannot parse', () => {
    expect(ecoDisasterNoteSet({ ...quake, timestamp: 'soon' }).notes[0].timeMs).toBeNull();
  });
});
