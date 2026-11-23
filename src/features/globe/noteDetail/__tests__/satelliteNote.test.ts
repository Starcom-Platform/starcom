/**
 * What a click on a satellite opens (critique C5, D-CT's open list): its name and number as CelesTrak lists them,
 * its altitude as drawn, that the position is predicted, and its record in CelesTrak's catalogue.
 */
import { describe, it, expect } from 'vitest';
import { satelliteNoteSet } from '../satelliteNote';
import { SATELLITE_PREDICTED_NOTE } from '../../../../services/Satellites/SatelliteDataManager';

describe('satelliteNoteSet', () => {
  it('opens a satellite with its catalogue number and its CelesTrak record', () => {
    const set = satelliteNoteSet({ id: '25544', name: 'ISS (ZARYA)', type: 'space_station', altitude: 418.4 });
    expect(set.heading).toBe('Satellites');
    expect(set.notes).toHaveLength(1);
    expect(set.notes[0]).toMatchObject({
      id: '25544', title: 'ISS (ZARYA)', kind: 'Satellite, Space station', timeMs: null,
      sources: ['https://celestrak.org/satcat/table-satcat.php?CATNR=25544'],
    });
    expect(set.notes[0].text.split('\n')).toEqual([
      'NORAD catalogue number 25544', 'Altitude about 418 km', SATELLITE_PREDICTED_NOTE,
    ]);
  });

  it('makes no link from an id that is not a catalogue number', () => {
    const note = satelliteNoteSet({ id: 'iss&CATNR=1', name: 'ISS', type: 'space_station', altitude: 408 }).notes[0];
    expect(note.sources).toEqual([]);
    expect(note.text).not.toContain('NORAD');
  });

  it('says no altitude it does not have', () => {
    const note = satelliteNoteSet({ id: '44713', name: 'STARLINK-1007', type: 'starlink', altitude: Number.NaN }).notes[0];
    expect(note.kind).toBe('Satellite, Starlink');
    expect(note.text).not.toContain('Altitude');
  });

  it('says what broke up, and when, for a piece of a debris cloud, with NASA\'s report of it', () => {
    const note = satelliteNoteSet({ id: '29228', name: 'FENGYUN 1C DEB', type: 'debris', altitude: 843, debrisOf: 'debris-fengyun-1c' }).notes[0];
    expect(note.kind).toBe('Satellite, Debris');
    expect(note.text.split('\n')[0]).toMatch(/^From Fengyun-1C, .*11 January 2007\.$/);
    expect(note.sources).toEqual([
      'https://celestrak.org/satcat/table-satcat.php?CATNR=29228',
      'https://orbitaldebris.jsc.nasa.gov/quarterly-news/pdfs/odqnv11i2.pdf',
    ]);
  });
});
