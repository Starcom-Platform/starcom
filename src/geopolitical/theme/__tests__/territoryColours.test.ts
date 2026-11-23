/**
 * The Classic style's colours (decision K5, TS2 and TS7): no two territories that
 * share a border share a colour, every territory has one, and the generated table
 * is what the script would write today.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRITORY_COLOUR_SLOT } from '../territoryColours';
import {
  SLOTS,
  clashes,
  colourModuleSource,
  colourTerritories,
  territoryNeighbours,
} from '../../../../scripts/lib/territoryNeighbours.mjs';

const root = path.resolve(__dirname, '../../../..');
const read = (lod: number) =>
  JSON.parse(fs.readFileSync(path.join(root, `public/geopolitical/world-territories-lod${lod}.geojson`), 'utf8'));
const levels = [read(0), read(1), read(2)];
const neighbours = territoryNeighbours(...levels);

describe('the Classic colours', () => {
  it('give every territory at every detail level a colour, and no code that is not one', () => {
    const codes = new Set(levels.flatMap((level) => level.features.map((f: { properties: { ADM0_A3: string } }) => f.properties.ADM0_A3)));
    expect(new Set(Object.keys(TERRITORY_COLOUR_SLOT))).toEqual(codes);
    for (const slot of Object.values(TERRITORY_COLOUR_SLOT)) expect(slot >= 0 && slot < SLOTS).toBe(true);
  });

  it('never give two neighbours the same colour', () => {
    expect(clashes(neighbours, TERRITORY_COLOUR_SLOT)).toEqual([]);
  });

  it('keep apart the neighbours Natural Earth\'s own MAPCOLOR7 paints alike', () => {
    for (const [a, b] of [['ISR', 'PSX'], ['CHN', 'HKG'], ['CHN', 'MAC'], ['USA', 'CAN'], ['FRA', 'ESP']]) {
      expect(neighbours.get(a)?.has(b)).toBe(true);
      expect(TERRITORY_COLOUR_SLOT[a]).not.toBe(TERRITORY_COLOUR_SLOT[b]);
    }
  });

  it('use all four colours about equally, so none floods the map', () => {
    const counts = new Array(SLOTS).fill(0);
    for (const slot of Object.values(TERRITORY_COLOUR_SLOT)) counts[slot]++;
    const share = counts.map((n) => n / Object.keys(TERRITORY_COLOUR_SLOT).length);
    for (const s of share) expect(s).toBeGreaterThan(0.2);
  });

  it('are the table the script writes from today\'s data (npm run geo:colours)', () => {
    const written = fs.readFileSync(path.join(root, 'src/geopolitical/theme/territoryColours.ts'), 'utf8');
    expect(written).toBe(colourModuleSource(colourTerritories(territoryNeighbours(...levels), TERRITORY_COLOUR_SLOT)));
  });
});

describe('territoryNeighbours', () => {
  const square = (code: string, x: number, y: number) => ({
    properties: { ADM0_A3: code },
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] },
  });

  it('counts a shared edge, not a shared corner', () => {
    const graph = territoryNeighbours({ features: [square('AAA', 0, 0), square('BBB', 1, 0), square('CCC', 1, 1)] });
    // AAA and CCC meet only at the corner (1, 1); BBB shares an edge with each.
    expect([...graph.get('AAA')!]).toEqual(['BBB']);
    expect([...graph.get('CCC')!]).toEqual(['BBB']);
    expect([...graph.get('BBB')!].sort()).toEqual(['AAA', 'CCC']);
  });

  it('lists a territory with no neighbours, so an island still gets a colour', () => {
    const graph = territoryNeighbours({ features: [square('ISL', 10, 10)] });
    expect(graph.get('ISL')?.size).toBe(0);
    expect(colourTerritories(graph)).toEqual({ ISL: 0 });
  });

  it('colours four mutual neighbours with four colours', () => {
    const graph = new Map([
      ['A', new Set(['B', 'C', 'D'])],
      ['B', new Set(['A', 'C', 'D'])],
      ['C', new Set(['A', 'B', 'D'])],
      ['D', new Set(['A', 'B', 'C'])],
    ]);
    const slots = colourTerritories(graph);
    expect(new Set(Object.values(slots)).size).toBe(4);
  });

  it('refuses a map that needs a fifth colour, rather than drawing two neighbours alike', () => {
    const five = ['A', 'B', 'C', 'D', 'E'];
    const graph = new Map(five.map((c) => [c, new Set(five.filter((o) => o !== c))]));
    expect(() => colourTerritories(graph)).toThrow(/no colouring/);
  });
});
