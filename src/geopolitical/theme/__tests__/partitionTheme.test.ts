/**
 * ZSP 2.0's colours (decision D-ZR): land and sea apart, and no two neighbours alike at either level.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { indexFrom } from '../../zones/zsp';
import { box, testPartition } from '../../zones/__tests__/testPartition';
import { colourInTurn, neighbours, partitionColours } from '../partitionTheme';

const { manifest, files } = testPartition();
const index = indexFrom(manifest, Object.values(files).map((t) => JSON.parse(t)));

describe('neighbours', () => {
  const poly = (w: number, so: number, e: number, n: number) => ({ type: 'Polygon' as const, coordinates: [box(w, so, e, n)] });

  it('are places that share an edge', () => {
    const near = neighbours([{ id: 'a', geometry: poly(0, 0, 10, 10) }, { id: 'b', geometry: poly(10, 0, 20, 10) }]);
    expect([...near.get('a')!]).toEqual(['b']);
  });

  it('meet across the antimeridian, where 180° and −180° are one line', () => {
    const near = neighbours([{ id: 'west', geometry: poly(-180, 0, -170, 10) }, { id: 'east', geometry: poly(170, 0, 180, 10) }]);
    expect([...near.get('west')!]).toEqual(['east']);
  });

  it('are not places that touch at a corner, or only at a pole', () => {
    const near = neighbours([
      { id: 'a', geometry: poly(0, 0, 10, 10) }, { id: 'b', geometry: poly(10, 10, 20, 20) },
      { id: 'p', geometry: poly(-180, 80, -90, 90) }, { id: 'q', geometry: poly(0, 80, 90, 90) },
    ]);
    expect([...near.values()].every((set) => set.size === 0)).toBe(true);
  });
});

describe('colourInTurn', () => {
  it('gives each the first colour no neighbour has', () => {
    const near = new Map([['a', new Set(['b'])], ['b', new Set(['a', 'c'])], ['c', new Set(['b'])]]);
    expect(Object.fromEntries(colourInTurn(['a', 'b', 'c'], near, [1, 2, 3]))).toEqual({ a: 1, b: 2, c: 1 });
  });
});

describe('partitionColours', () => {
  const colours = partitionColours(index);

  it('colours a Terra and a Mare from their own palettes, so land and sea never share one', () => {
    expect(colours.containers.size).toBe(2);
    expect(colours.containers.get('terra:borea')).not.toBe(colours.containers.get('mare:austra'));
  });

  it('gives each Zone a shade of its container, its neighbour another', () => {
    expect(colours.zones.size).toBe(4);
    expect(colours.zones.get('zone:borea-west')).not.toBe(colours.zones.get('zone:borea-east'));
    expect(colours.zones.get('zone:austra-west')).not.toBe(colours.zones.get('zone:austra-east'));
  });

  it('never draws in the app\'s cyan', () => {
    for (const c of [...colours.containers.values(), ...colours.zones.values()]) {
      const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      expect(r < 80 && g > 180 && b > 180, c.toString(16)).toBe(false);
    }
  });
});
