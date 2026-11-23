/**
 * Natural Earth's country names, as the globe draws them (decision K5, step 4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRITORY_LABELS } from '../territoryLabels';
import { TERRITORY_COLOUR_SLOT } from '../territoryColours';
import { labelModuleSource, labelRows, nameLines } from '../../../../scripts/lib/territoryLabels.mjs';

const root = path.resolve(__dirname, '../../../..');
const lod0 = JSON.parse(fs.readFileSync(path.join(root, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8'));

type Ring = number[][];
const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPolygon = (x: number, y: number, polygon: Ring[]) => inRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => inRing(x, y, hole));
const polygonsOf = (feature: { geometry: { type: string; coordinates: unknown } }) =>
  (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][];

describe('the country names table', () => {
  it('is the table the script writes from today\'s data (npm run geo:labels)', () => {
    const written = fs.readFileSync(path.join(root, 'src/geopolitical/theme/territoryLabels.ts'), 'utf8');
    expect(written).toBe(labelModuleSource(labelRows(lod0)));
  });

  it('names every territory the fills draw, once', () => {
    const codes = TERRITORY_LABELS.map((l) => l.code);
    expect(codes).toHaveLength(247);
    expect(new Set(codes)).toEqual(new Set(Object.keys(TERRITORY_COLOUR_SLOT)));
    for (const label of TERRITORY_LABELS) {
      expect(Number.isFinite(label.lng) && Number.isFinite(label.lat), label.code).toBe(true);
    }
  });

  it('uses Natural Earth\'s short map names, not its long forms', () => {
    const name = (code: string) => TERRITORY_LABELS.find((l) => l.code === code)?.name;
    expect(name('COD')).toBe('Dem. Rep. Congo');
    expect(name('CHN')).toBe('China');
  });

  it('breaks a long name once, at the space nearest its middle, and never a name with no space', () => {
    expect(TERRITORY_LABELS.find((l) => l.code === 'USA')?.lines).toEqual(['UNITED STATES', 'OF AMERICA']);
    expect(TERRITORY_LABELS.filter((l) => l.lines.length > 1)).toHaveLength(24);
    expect(nameLines('Abcdefghijklmnopqrstu')).toEqual(['ABCDEFGHIJKLMNOPQRSTU']);
    expect(nameLines('Chad')).toEqual(['CHAD']);
  });

  it('lists names in the order they are placed: rank, then the zoom they label at, then code', () => {
    for (let i = 1; i < TERRITORY_LABELS.length; i++) {
      const a = TERRITORY_LABELS[i - 1];
      const b = TERRITORY_LABELS[i];
      expect(a.rank < b.rank || (a.rank === b.rank && (a.minZoom < b.minZoom || (a.minZoom === b.minZoom && a.code < b.code))), `${a.code} before ${b.code}`).toBe(true);
    }
  });

  /*
   * Natural Earth puts an archipelago's or a micro-state's name at sea, between its
   * islands or beside its specks, on purpose; what must not happen is a name standing
   * on another country. Two do, at the coarse detail the table is checked against.
   */
  it('stands no name on another country, but two the coarse outlines swallow', () => {
    const SWALLOWED: Record<string, string> = {
      VAT: 'inside Rome: Italy\'s coarse outline has no hole for the Vatican',
      GMB: 'Senegal\'s coarse outline covers the Gambia\'s thin river valley',
    };
    const standingOnAnother: string[] = [];
    for (const label of TERRITORY_LABELS) {
      for (const feature of lod0.features) {
        if (feature.properties.ADM0_A3 === label.code) continue;
        if (polygonsOf(feature).some((polygon) => inPolygon(label.lng, label.lat, polygon))) standingOnAnother.push(label.code);
      }
    }
    expect(standingOnAnother.sort()).toEqual(Object.keys(SWALLOWED).sort());
  });
});
