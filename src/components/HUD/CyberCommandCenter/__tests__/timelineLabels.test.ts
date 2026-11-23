import { describe, it, expect } from 'vitest';
import { placeLabels, type LabelCandidate } from '../timelineLabels';

const room = { rows: 3, gap: 6, minX: 0, maxX: 800 };

describe('placeLabels', () => {
  it('puts names that do not collide on the row nearest the pins', () => {
    const names = [0, 1, 2].map((i) => ({ id: `n${i}`, x: 100 + i * 200, width: 80, importance: 0 }));
    expect(placeLabels(names, room)).toEqual(names.map((n) => ({ id: n.id, row: 0 })));
  });

  it('moves a colliding name up a row instead of printing it over another', () => {
    const names = [
      { id: 'a', x: 100, width: 80, importance: 0 },
      { id: 'b', x: 130, width: 80, importance: 0 },
    ];
    expect(placeLabels(names, room)).toEqual([{ id: 'a', row: 0 }, { id: 'b', row: 1 }]);
  });

  it('keeps clear space between two names, not just keeps them from overlapping', () => {
    // Edges touching exactly: 60..140 and 140..220. Legible only with the gap.
    const names = [
      { id: 'a', x: 100, width: 80, importance: 0 },
      { id: 'b', x: 180, width: 80, importance: 0 },
    ];
    expect(placeLabels(names, room)).toEqual([{ id: 'a', row: 0 }, { id: 'b', row: 1 }]);
    expect(placeLabels(names, { ...room, gap: 0 })).toEqual([{ id: 'a', row: 0 }, { id: 'b', row: 0 }]);
  });

  it('leaves a name off once every row is taken where it would go', () => {
    const names = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, x: 100 + i, width: 80, importance: 0 }));
    expect(placeLabels(names, room)).toEqual([
      { id: 's0', row: 0 }, { id: 's1', row: 1 }, { id: 's2', row: 2 },
    ]);
  });

  it('gives the more important event first claim on the room', () => {
    const names = [
      { id: 'minor', x: 100, width: 80, importance: 10 },
      { id: 'major', x: 110, width: 80, importance: 90 },
    ];
    expect(placeLabels(names, { ...room, rows: 1 })).toEqual([{ id: 'major', row: 0 }]);
  });

  it('never prints a name that would run off the canvas', () => {
    expect(placeLabels([{ id: 'edge', x: 20, width: 80, importance: 0 }], room)).toEqual([]);
    expect(placeLabels([{ id: 'edge', x: 790, width: 80, importance: 0 }], room)).toEqual([]);
  });

  it('keeps names on a row apart across a run as dense as the real one', () => {
    // 93 names 7.5px apart, as wide as a truncated event title.
    const names: LabelCandidate[] = Array.from({ length: 93 }, (_, i) => ({
      id: `d${i}`, x: 50 + i * 7.5, width: 90, importance: (i * 37) % 100,
    }));
    const placed = placeLabels(names, room);
    const byId = new Map(names.map((n) => [n.id, n]));

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(93);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b || a.row !== b.row) continue;
        const na = byId.get(a.id)!;
        const nb = byId.get(b.id)!;
        expect(Math.abs(na.x - nb.x)).toBeGreaterThanOrEqual((na.width + nb.width) / 2 + room.gap);
      }
    }
  });
});
