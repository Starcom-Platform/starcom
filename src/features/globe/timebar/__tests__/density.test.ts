import { describe, it, expect } from 'vitest';
import { densityStrip, layerIdOfName, LAYER_KIND } from '../density';
import { KIND_COLOURS } from '../../../../styles/tokens';

const CATALOGUE = [
  { id: 'ConflictZones', label: 'Conflict Zones' },
  { id: 'WarConflict', label: 'War & Conflict' },
  { id: 'EcologicalDisasters', label: 'Eco Disasters' },
];

describe("the time bar's density strip (critique-2026-11-01, OR17, OR25)", () => {
  it("finds a mark's layer by the catalogue label its name starts with", () => {
    expect(layerIdOfName('Conflict Zones — armed conflict', CATALOGUE)).toBe('ConflictZones');
    expect(layerIdOfName('War & Conflict', CATALOGUE)).toBe('WarConflict');
    expect(layerIdOfName('Something else', CATALOGUE)).toBeNull();
    expect(layerIdOfName(null, CATALOGUE)).toBeNull();
  });

  it('gives every layer of the catalogue a kind with a colour', () => {
    for (const kind of Object.values(LAYER_KIND)) expect(KIND_COLOURS[kind]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('counts the drawn marks in the range a bin each, split by colour, the commonest first', () => {
    const t0 = Date.UTC(2026, 10, 1);
    const hour = 3_600_000;
    const marks = [
      { timeMs: t0 + 1 * hour, layer: 'Conflict Zones — armed conflict' },
      { timeMs: t0 + 1.5 * hour, layer: 'Conflict Zones — armed conflict' },
      { timeMs: t0 + 1.2 * hour, layer: 'Eco Disasters' },
      { timeMs: t0 + 23 * hour, layer: 'War & Conflict' },
      { timeMs: t0 - hour, layer: 'War & Conflict' },
      { timeMs: null, layer: 'Eco Disasters' },
    ];
    const colourOf = (layer: string | null) => KIND_COLOURS[LAYER_KIND[layerIdOfName(layer, CATALOGUE) ?? ''] ?? 'infra'];
    const strip = densityStrip(marks, { start: t0, end: t0 + 24 * hour }, 24, colourOf);
    expect(strip.bins).toHaveLength(24);
    expect(strip.bins[1].parts).toEqual([{ colour: KIND_COLOURS.conflict, count: 2 }, { colour: KIND_COLOURS.hazards, count: 1 }]);
    expect(strip.bins[1].total).toBe(3);
    expect(strip.bins[23].total).toBe(1);
    expect(strip.max).toBe(3);
    // One before the range, one with no time.
    expect(strip.counted).toBe(4);
    expect(strip.untimed).toBe(1);
  });
});
