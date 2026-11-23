/**
 * Framing a card to an area (BA22): its largest part, each other part that
 * fits with it, and what is outside the frame, in words a reader would use.
 *
 * A part fits when one view holds it with the largest part from no more than
 * half as far again as the largest part needs alone. Fitting anything one view
 * could hold would pull French Guiana into an EU card and draw Europe a third
 * the size.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frameForArea, frameShows, outsideInWords } from '../areaFrame';
import { areaShapesFrom } from '../../areas/areaShapes';
import { AREAS, areaByCode } from '../../areas/areaRegistry';
import { CARD_PRESETS } from '../shareCardLayout';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { pointInGeometry } from '../../../../services/geoint/pointInPolygon';
import { regionPlace } from '../regionPlace';
import { SHARE_ALTITUDE_CEILING, SHARE_ALTITUDE_FLOOR } from '../shareReports';

const ROOT = resolve(__dirname, '../../../../..');
const read = (file: string) => JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical', file), 'utf8'));
const SHAPES = areaShapesFrom(read('areas-lod0.geojson'));
const TERRITORIES = buildTerritoryIndex(read('world-territories-lod0.geojson').features);
const view = (preset: keyof typeof CARD_PRESETS = 'wide') => ({ fovDeg: 50, frameAspect: 1400 / 900, cardAspect: CARD_PRESETS[preset].globeAspect });
const frame = (code: string, preset: keyof typeof CARD_PRESETS = 'wide') => frameForArea(SHAPES.get(code)!, view(preset));
const words = (code: string) => outsideInWords(frame(code)!, view(), { area: areaByCode(code)!, territories: TERRITORIES, shapes: SHAPES });

describe('the frame of an area (BA22)', () => {
  it('the EU: its mainland, close, and France\'s overseas regions outside, each named', () => {
    const eu = frame('union:eu')!;
    expect(eu.centre.lat).toBeGreaterThan(40);
    expect(eu.centre.lng).toBeGreaterThan(-5);
    expect(eu.centre.lng).toBeLessThan(30);
    expect(eu.altitude).toBeLessThan(1.6);
    expect(words('union:eu')).toBe('Outside the frame: French Guiana, Réunion, Guadeloupe and 2 more.');
    expect(frameShows(eu, view(), { lat: 48.9, lng: 2.4 })).toBe(true);
    expect(frameShows(eu, view(), { lat: 4.0, lng: -53.0 })).toBe(false);
  });

  it('members out of view by name, and past four by count, with their continents', () => {
    expect(words('sphere:anglosphere')).toBe('Outside the frame: Australia and New Zealand.');
    expect(words('sphere:lusosphere')).toMatch(/^Outside the frame: \d of its 9 members, in .*Africa.*\.$/);
  });

  it('the Francophonie, centred on its largest part, Canada, says most of it is out of view', () => {
    const f = frame('sphere:francophonie')!;
    expect(f.centre.lng).toBeLessThan(-50);
    expect(words('sphere:francophonie')).toMatch(/^Outside the frame: 4\d of its 50 members, in .*Africa.*\.$/);
  });

  it('a continent\'s outlying parts by the countries there, past four by count', () => {
    expect(words('continent:oceania')).toMatch(/^Outside the frame: Fiji, .* and \d+ more\.$/);
    expect(words('union:asean')).toBe('Outside the frame: part of Indonesia.');
  });

  it('a drawn zone\'s parts by the continents they reach', () => {
    // Retired (ZR8), drawn as the Zones that hold it: the frame holds the largest part, and names the continents of
    // the rest, and the sea its ocean Zones reach.
    expect(words('zone:ring-of-fire')).toMatch(/^Outside the frame: its parts? in (Asia|Oceania|North America|South America)( and (Asia|Oceania|North America|South America))*(, and at sea)?\.$/);
  });

  it('nothing outside an area one view holds, and the card points inside it, where it is listed', () => {
    for (const code of ['zone:sahel', 'zone:balkans', 'union:gcc', 'continent:africa', 'zone:golden-triangle', 'sphere:hispanosphere']) {
      const f = frame(code)!;
      expect(words(code), code).toBeNull();
      expect(f.outside, code).toEqual([]);
      expect(f.position, code).toEqual({ lat: regionPlace(SHAPES.get(code)!)!.lat, lng: regionPlace(SHAPES.get(code)!)!.lng });
      expect(pointInGeometry(f.position.lat, f.position.lng, SHAPES.get(code)!.geometry), code).toBe(true);
      expect(frameShows(f, view(), f.position), code).toBe(true);
    }
  });

  it('every area framed in every size, between the floor and the ceiling, showing where it points', () => {
    for (const area of AREAS) {
      for (const preset of Object.keys(CARD_PRESETS) as Array<keyof typeof CARD_PRESETS>) {
        const f = frame(area.code, preset);
        expect(f, `${area.code} ${preset}`).not.toBeNull();
        expect(f!.altitude, `${area.code} ${preset}`).toBeGreaterThanOrEqual(SHARE_ALTITUDE_FLOOR);
        expect(f!.altitude, `${area.code} ${preset}`).toBeLessThanOrEqual(SHARE_ALTITUDE_CEILING);
        expect(frameShows(f!, view(preset), f!.position), `${area.code} ${preset}`).toBe(true);
      }
    }
  });

  it('a small area close, a large one far', () => {
    expect(frame('zone:golden-triangle')!.altitude).toBe(SHARE_ALTITUDE_FLOOR);
    expect(frame('zone:golden-triangle')!.altitude).toBeLessThan(frame('continent:asia')!.altitude);
  });
});
