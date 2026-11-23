/**
 * Which names are drawn, and where, so that none overlaps another or a mark a
 * person clicks: one greedy placer for every set of names on the globe (the
 * solar system's bodies, the countries: decision K5, step 4).
 *
 * Names are taken in the order given, which the caller decides (rank first). Each
 * goes where it stands, or a line above or below when a mark is in the way, or is
 * dropped. Names never move for one another: a name that meets one already placed
 * is dropped, so the stronger name keeps its place and the picture does not shuffle.
 *
 * A uniform grid of 32 px cells holds what is placed and every obstacle, so a
 * placement over a few hundred names and a few thousand marks stays well under a
 * millisecond.
 */

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NameToPlace {
  id: string;
  box: ScreenBox;
  /** Vertical moves to try, in px, when a mark is in the way. [0] when absent. */
  shifts?: readonly number[];
}

export interface PlaceOptions {
  /** Kept clear around every name, on each side, in px. */
  pad?: number;
  /** A name must lie wholly inside this, less the margin. */
  viewport?: { width: number; height: number };
  /** Kept clear inside the viewport's edges, in px. */
  margin?: number;
  /** The most names placed. */
  cap?: number;
  /** Never covered: the marks a person clicks. */
  hard?: readonly ScreenBox[];
  /** Covered by no more than `softTolerance` each: small dots. */
  soft?: readonly ScreenBox[];
  softTolerance?: number;
}

export interface PlacedName {
  id: string;
  /** Where it was placed, shift included, without the pad. */
  box: ScreenBox;
  shift: number;
}

const CELL = 32;

const meets = (a: ScreenBox, b: ScreenBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Boxes in grid cells, so a query looks only at what is near. */
class Grid {
  private cells = new Map<number, ScreenBox[]>();

  private static key(cx: number, cy: number) {
    return cx * 100_003 + cy;
  }

  private span(box: ScreenBox): [number, number, number, number] {
    return [Math.floor(box.x / CELL), Math.floor(box.y / CELL), Math.floor((box.x + box.width) / CELL), Math.floor((box.y + box.height) / CELL)];
  }

  add(box: ScreenBox): void {
    const [x0, y0, x1, y1] = this.span(box);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = Grid.key(cx, cy);
        const cell = this.cells.get(key);
        if (cell) cell.push(box);
        else this.cells.set(key, [box]);
      }
    }
  }

  /** How many distinct boxes meet `box`, stopping once `limit` is passed. */
  count(box: ScreenBox, limit = Infinity): number {
    const [x0, y0, x1, y1] = this.span(box);
    const seen = new Set<ScreenBox>();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (const other of this.cells.get(Grid.key(cx, cy)) ?? []) {
          if (seen.has(other) || !meets(box, other)) continue;
          seen.add(other);
          if (seen.size > limit) return seen.size;
        }
      }
    }
    return seen.size;
  }
}

const padded = (box: ScreenBox, pad: number): ScreenBox => ({ x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad });

/** Places names in the order given; returns those placed, in that order. */
export function placeNamesIn(names: readonly NameToPlace[], options: PlaceOptions = {}): PlacedName[] {
  const pad = options.pad ?? 0;
  const margin = options.margin ?? 0;
  const cap = options.cap ?? Infinity;
  const softTolerance = options.softTolerance ?? 0;
  const placedGrid = new Grid();
  const hardGrid = new Grid();
  const softGrid = new Grid();
  for (const box of options.hard ?? []) hardGrid.add(box);
  for (const box of options.soft ?? []) softGrid.add(box);
  const inside = (box: ScreenBox) => !options.viewport || (
    box.x >= margin && box.y >= margin
    && box.x + box.width <= options.viewport.width - margin
    && box.y + box.height <= options.viewport.height - margin
  );

  const placed: PlacedName[] = [];
  for (const name of names) {
    if (placed.length >= cap) break;
    for (const shift of name.shifts ?? [0]) {
      const box = { ...name.box, y: name.box.y + shift };
      const clear = padded(box, pad);
      // Another name in the way: dropped, never moved, so the stronger keeps its place.
      if (placedGrid.count(clear, 0) > 0) break;
      if (!inside(box)) continue;
      if (hardGrid.count(clear, 0) > 0) continue;
      if (softGrid.count(clear, softTolerance) > softTolerance) continue;
      placedGrid.add(clear);
      placed.push({ id: name.id, box, shift });
      break;
    }
  }
  return placed;
}

/**
 * Which names are drawn: each in rank order, unless its box overlaps one already
 * placed. Returns the ids placed. The solar system's names (bodyLabels.ts) are placed
 * this way.
 */
export function placeNames(labels: Array<{ id: string; rank: number; box: ScreenBox }>): Set<string> {
  const ranked = [...labels].sort((a, b) => a.rank - b.rank);
  return new Set(placeNamesIn(ranked).map((p) => p.id));
}
