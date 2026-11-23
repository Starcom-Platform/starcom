/**
 * One placer for every set of names on the globe (decision K5, step 4).
 */
import { describe, expect, it } from 'vitest';
import { placeNames, placeNamesIn, type NameToPlace, type ScreenBox } from '../placeNames';

const box = (x: number, y: number, width = 40, height = 12): ScreenBox => ({ x, y, width, height });
const meets = (a: ScreenBox, b: ScreenBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const grow = (b: ScreenBox, pad: number): ScreenBox => ({ x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad });

/** A small seeded generator, so a failing layout can be named and run again. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('placeNamesIn', () => {
  it('never lets two placed names meet, padding included, nor a name cover a hard obstacle: 500 random layouts', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = seeded(seed);
      const names: NameToPlace[] = Array.from({ length: 60 }, (_, i) => ({
        id: `n${i}`,
        box: box(rnd() * 900, rnd() * 600, 20 + rnd() * 80, 12),
        shifts: [0, -14, 14],
      }));
      const hard = Array.from({ length: 30 }, () => box(rnd() * 900, rnd() * 600, 18, 18));
      const placed = placeNamesIn(names, { pad: 3, hard });
      for (let i = 0; i < placed.length; i++) {
        for (const obstacle of hard) expect(meets(grow(placed[i].box, 3), obstacle), `seed ${seed}`).toBe(false);
        for (let j = i + 1; j < placed.length; j++) {
          expect(meets(grow(placed[i].box, 3), grow(placed[j].box, 3)), `seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('keeps the earlier name and drops the later, never moving one name for another', () => {
    const placed = placeNamesIn([
      { id: 'strong', box: box(100, 100) },
      { id: 'weak', box: box(110, 100), shifts: [0, -14, 14] },
    ]);
    expect(placed.map((p) => p.id)).toEqual(['strong']);
  });

  it('moves a name a line up or down to clear a mark, in the order its shifts are given, then drops it', () => {
    const mark = box(100, 100, 18, 12);
    expect(placeNamesIn([{ id: 'a', box: box(100, 100), shifts: [0, -14, 14] }], { hard: [mark] })).toEqual([{ id: 'a', box: box(100, 86), shift: -14 }]);
    const fenced = [mark, box(100, 86, 18, 12), box(100, 114, 18, 12)];
    expect(placeNamesIn([{ id: 'a', box: box(100, 100), shifts: [0, -14, 14] }], { hard: fenced })).toEqual([]);
  });

  it('lets a name cover a few small dots, and no more', () => {
    const dots = [box(105, 102, 4, 4), box(115, 102, 4, 4), box(125, 102, 4, 4)];
    expect(placeNamesIn([{ id: 'a', box: box(100, 100) }], { soft: dots.slice(0, 2), softTolerance: 2 })).toHaveLength(1);
    expect(placeNamesIn([{ id: 'a', box: box(100, 100) }], { soft: dots, softTolerance: 2 })).toHaveLength(0);
  });

  it('places nothing over the viewport\'s edge, its margin included', () => {
    const viewport = { width: 300, height: 200 };
    expect(placeNamesIn([{ id: 'a', box: box(2, 50) }], { viewport, margin: 4 })).toHaveLength(0);
    expect(placeNamesIn([{ id: 'a', box: box(4, 50) }], { viewport, margin: 4 })).toHaveLength(1);
    expect(placeNamesIn([{ id: 'a', box: box(257, 50) }], { viewport, margin: 4 })).toHaveLength(0);
  });

  it('places no more than its cap, the first first', () => {
    const names = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, box: box(i * 60, 0) }));
    expect(placeNamesIn(names, { cap: 3 }).map((p) => p.id)).toEqual(['n0', 'n1', 'n2']);
  });

  it('places the same names in the same places from the same input', () => {
    const rnd = seeded(7);
    const names = Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, box: box(rnd() * 500, rnd() * 300) }));
    expect(placeNamesIn(names, { pad: 3 })).toEqual(placeNamesIn(names, { pad: 3 }));
  });
});

describe('placeNames, as the solar system calls it', () => {
  it('takes names by rank, whatever order they come in', () => {
    const placed = placeNames([
      { id: 'moon', rank: 2, box: box(105, 100) },
      { id: 'sun', rank: 0, box: box(100, 100) },
    ]);
    expect([...placed]).toEqual(['sun']);
  });
});
