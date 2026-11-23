/**
 * Earthquakes as Earthquake 3D draws them, done sharper (D-EQ, EQ10): each quake's flag says its magnitude in the
 * colour of its band; flags that crowd on screen stack on the strongest one's line, the strongest highest, up to the
 * limit, the rest counted on a chip at the lowest step; a ring of how far it was likely felt grows with magnitude.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  atlasCellOf, badgeIndex, bandOf, bandsChosenWords, BADGE_OFFSET_PX, buildQuakeFlags, chipIndex, deathsClass, DEATHS_CLASS_LABELS, quakeInBands, columnOf, DEPTH_UNKNOWN, depthColour, FLAG_ATLAS_ROWS, flagCellOf, stalkHeightFor, indicativeRingKm, MAGNITUDE_UNKNOWN, magnitudeColour, magnitudeIndex, magnitudeLabel, ringPositions, stackFlags, UNKNOWN_MAGNITUDE_CELL,
} from '../quakeFlags';
import { DATA_SCALES } from '../../../../styles/tokens';
import { PIN_HEIGHT } from '../kindMarks';

describe("a quake's flag", () => {
  it('says its magnitude to a tenth, in the colour of its whole-step band', () => {
    expect(magnitudeLabel(6.24)).toBe('6.2');
    expect(magnitudeLabel(12)).toBe('9.9');
    expect(magnitudeLabel(-1)).toBe('0.0');
    const bands = DATA_SCALES.quakeMagnitude;
    expect(magnitudeColour(2.9)).toBe(bands[0][1]);
    expect(magnitudeColour(5.0)).toBe(bands.find(([from]) => from === 5)?.[1]);
    expect(magnitudeColour(8.1)).toBe(bands[bands.length - 1][1]);
  });

  it('finds its cell in the atlas, the chips after the hundred magnitudes', () => {
    expect(magnitudeIndex(6.2)).toBe(62);
    expect(atlasCellOf(62)).toEqual({ cell: 62 % 16, row: Math.floor(62 / 16) });
    expect(chipIndex(1)).toBe(100);
    expect(chipIndex(500)).toBe(198);
    expect(atlasCellOf(chipIndex(500)).row).toBeLessThan(FLAG_ATLAS_ROWS);
  });

  it('rings how far a quake was likely felt, growing with magnitude', () => {
    expect(Math.round(indicativeRingKm(5))).toBe(89);
    expect(Math.round(indicativeRingKm(7))).toBe(407);
    expect(indicativeRingKm(6)).toBeGreaterThan(indicativeRingKm(5));
    const ring = ringPositions(10, 20, 100);
    // A closed circle on the surface: its first and last points meet.
    expect(ring.slice(0, 3).map((x) => Number(x.toFixed(6)))).toEqual(ring.slice(-3).map((x) => Number(x.toFixed(6))));
  });
});

describe('an atlas quake of no recorded magnitude', () => {
  it('gets a flag saying "?", grey, with its badge and no ring, keyed as not recorded', () => {
    expect(flagCellOf(null)).toBe(UNKNOWN_MAGNITUDE_CELL);
    expect(flagCellOf(6.2)).toBe(62);
    expect(atlasCellOf(UNKNOWN_MAGNITUDE_CELL).row).toBeLessThan(FLAG_ATLAS_ROWS);
    expect(UNKNOWN_MAGNITUDE_CELL).toBeGreaterThan(badgeIndex({ deaths: 200000, deathsOrder: null, tsunami: true }));
    const items = [
      { id: 'old', lat: 38, lng: 23, magnitude: null, atlas: { deaths: 5000, deathsOrder: null, tsunami: true } },
      { id: 'new', lat: 10, lng: 20, magnitude: 6.1 },
    ];
    const flags = buildQuakeFlags(items, null, { type: 'q', label: 'Q' });
    expect(flags.magnitudeUnknown).toBe(true);
    expect(flags.bandsDrawn).toEqual([6]);
    expect(flags.rings).toBe(1);
    expect(flags.badges).toBe(1);
    const tint = flags.flags?.geometry.getAttribute('markTint') as THREE.BufferAttribute;
    expect(`#${new THREE.Color(tint.getX(0), tint.getY(0), tint.getZ(0)).getHexString()}`.toUpperCase()).toBe(MAGNITUDE_UNKNOWN.toUpperCase());
    expect(buildQuakeFlags([items[1]], null, { type: 'q', label: 'Q' }).magnitudeUnknown).toBe(false);
    expect(buildQuakeFlags(items, null, { type: 'q', label: 'Q', colourBy: 'depth' }).magnitudeUnknown).toBe(false);
  });
});

describe('a quake coloured by depth (EQ5)', () => {
  it("takes USGS's depth band, grey where no depth is stated", () => {
    const bands = DATA_SCALES.quakeDepthKm;
    expect(depthColour(10)).toBe(bands[0][1]);
    expect(depthColour(33)).toBe(bands[1][1]);
    expect(depthColour(640)).toBe(bands[bands.length - 1][1]);
    expect(depthColour(null)).toBe(DEPTH_UNKNOWN);
    expect(bandOf(120, bands)).toBe(70);
  });

  it('tints each flag, its line and the key bands by the colour chosen', () => {
    const items = [
      { id: 'a', lat: 10, lng: 20, magnitude: 5.2, depthKm: 12 },
      { id: 'b', lat: -30, lng: 140, magnitude: 3.1, depthKm: 410 },
      { id: 'c', lat: 0, lng: 0, magnitude: 2.2 },
    ];
    const byDepth = buildQuakeFlags(items, null, { type: 'q', label: 'Q', colourBy: 'depth' });
    expect(byDepth.bandsDrawn).toEqual([0, 300]);
    expect(byDepth.depthUnknown).toBe(true);
    // Linear, as the decoded atlas is: the shader takes it back to the screen's colour, the hex itself (EQ13).
    const tint = byDepth.flags?.geometry.getAttribute('markTint') as THREE.BufferAttribute;
    const hexOf = (i: number) => `#${new THREE.Color(tint.getX(i), tint.getY(i), tint.getZ(i)).getHexString()}`.toUpperCase();
    expect([hexOf(0), hexOf(1), hexOf(2)]).toEqual([depthColour(12), depthColour(410), DEPTH_UNKNOWN].map((c) => c.toUpperCase()));
    const shaken = buildQuakeFlags([{ ...items[0], shaking: [{ mmi: 2.5, lines: [[[20, 10], [20.1, 10.1]]] }, { mmi: 2, lines: [[[20, 10], [20.2, 10.2]]] }] }], null, { type: 'q', label: 'Q' });
    // Keyed by whole step: a lone 2.5 line and a II line are one entry, never two "shaking II".
    expect(shaken.mmiDrawn).toEqual([2]);
    const byMagnitude = buildQuakeFlags(items, null, { type: 'q', label: 'Q' });
    expect(byMagnitude.bandsDrawn).toEqual([0, 3, 5]);
    expect(byMagnitude.depthUnknown).toBe(false);
  });
});

describe('the quakes chosen by band (EQ6)', () => {
  const ALL_M = DATA_SCALES.quakeMagnitude.map(([b]) => String(b));
  const ALL_D = DATA_SCALES.quakeDepthKm.map(([b]) => String(b));

  it('keeps a quake whose magnitude and depth are both in bands chosen', () => {
    expect(quakeInBands(4.6, 10, ['4', '5'], ALL_D)).toBe(true);
    expect(quakeInBands(3.9, 10, ['4', '5'], ALL_D)).toBe(false);
    expect(quakeInBands(5.1, 600, ALL_M, ['0', '33'])).toBe(false);
  });

  it('keeps a quake of no stated depth only while every depth band is chosen', () => {
    expect(quakeInBands(5, null, ALL_M, ALL_D)).toBe(true);
    expect(quakeInBands(5, null, ALL_M, ['0'])).toBe(false);
  });

  it('says the bands chosen, neighbours run together, nothing when all are', () => {
    expect(bandsChosenWords(ALL_M, DATA_SCALES.quakeMagnitude)).toBeNull();
    expect(bandsChosenWords(['4', '5', '6', '7'], DATA_SCALES.quakeMagnitude)).toBe('4 and over');
    expect(bandsChosenWords(['0', '5', '6'], DATA_SCALES.quakeMagnitude)).toBe('under 3; 5 to 7');
    expect(bandsChosenWords(['0', '33'], DATA_SCALES.quakeDepthKm, ' km')).toBe('0 to 70 km');
    expect(bandsChosenWords(['500'], DATA_SCALES.quakeDepthKm, ' km')).toBe('500 km or deeper');
    expect(bandsChosenWords([], DATA_SCALES.quakeDepthKm, ' km')).toBe('none');
  });
});

const at0 = { x: 0, y: 0 };

describe("a significant quake's badge (EQ16)", () => {
  it("names its deaths to the least power of ten NOAA's count reaches, or its order where no count is known", () => {
    expect([deathsClass(7, null), deathsClass(131, 3), deathsClass(18423, 4), deathsClass(316000, 4)]).toEqual([1, 3, 5, 6]);
    expect([deathsClass(null, 1), deathsClass(null, 4), deathsClass(null, null)]).toEqual([1, 4, 0]);
    expect(DEATHS_CLASS_LABELS[deathsClass(18423, null)]).toBe('\u202010k+');
  });

  it('has a cell of its own for each class, with and without a wave, and none for neither', () => {
    const cells = new Set<number>();
    for (let c = 0; c <= 6; c += 1) for (const tsunami of [false, true]) {
      const index = badgeIndex({ deaths: c ? 10 ** (c - 1) : null, deathsOrder: null, tsunami });
      if (c === 0 && !tsunami) expect(index).toBe(-1); else cells.add(index);
    }
    expect(cells.size).toBe(13);
    expect(Math.max(...cells)).toBeLessThan(FLAG_ATLAS_ROWS * 16);
    expect(badgeIndex(null)).toBe(-1);
  });

  it("widens its stack's column by the badge, so a neighbour keeps clear of it", () => {
    expect(columnOf(at0, 1, true).x1 - columnOf(at0, 1).x1).toBeCloseTo(BADGE_OFFSET_PX, 6);
    // A quake right of a badged flag, clear of the flag but not of its badge: it joins the stack.
    const screen = [{ x: 100, y: 100 }, { x: 140, y: 100 }];
    expect(stackFlags(screen, [6, 4]).host).toEqual([0, 1]);
    expect(stackFlags(screen, [6, 4], 34, 4, [], [true, false]).host).toEqual([0, 0]);
  });
});

describe("a quake's line", () => {
  it('stands about as long on screen at every zoom, never past a pin', () => {
    expect(stalkHeightFor(2.5)).toBe(PIN_HEIGHT);
    expect(stalkHeightFor(0.12)).toBeCloseTo(0.018, 6);
    expect(stalkHeightFor(0.2) / stalkHeightFor(0.1)).toBeCloseTo(2, 6);
    expect(stalkHeightFor(0)).toBeGreaterThan(0);
  });
});

describe('flags that crowd', () => {
  const at = (x: number, y: number) => ({ x, y });

  it('stack on the strongest, the strongest highest, each apart from the next', () => {
    const { slot, host, height, more } = stackFlags([at(100, 100), at(108, 104), at(103, 96)], [5.1, 6.4, 4.2]);
    expect(host).toEqual([1, 1, 1]);
    expect(slot).toEqual([1, 0, 2]);
    expect(height).toEqual([1, 2, 0]);
    expect(more).toEqual([0, 0, 0]);
  });

  it('show only the limit, the rest counted on the chip at the lowest step', () => {
    const screen = [at(50, 50), at(52, 50), at(54, 50), at(56, 50), at(58, 50), at(60, 50)];
    const { slot, height, more } = stackFlags(screen, [6, 5, 4, 3, 2, 1], 26, 4);
    expect(slot).toEqual([0, 1, 2, 3, -1, -1]);
    expect(more[0]).toBe(2);
    // The chip takes step 0: the four flags stand above it, the strongest at the top.
    expect(height.slice(0, 4)).toEqual([4, 3, 2, 1]);
  });

  it('keep apart what is apart, and leave out what is off screen', () => {
    const { host, slot } = stackFlags([at(10, 10), at(300, 300), null], [5, 5, 7]);
    expect(host).toEqual([0, 1, -1]);
    expect(slot).toEqual([0, 0, -1]);
  });

  it('never let one stack reach into a stronger one: a weaker stack with no room joins its count', () => {
    // Four strong flags at (100, 100) stand a column four steps high; a weaker quake above it, past the stack's
    // radius, would stand its flag inside that column.
    const screen = [at(100, 100), at(104, 102), at(98, 104), at(102, 98), at(110, 40)];
    const { host, slot, more } = stackFlags(screen, [6, 5.5, 5.2, 5, 3]);
    expect(host[4]).toBe(0);
    expect(slot[4]).toBe(-1);
    // The stronger stack grew a step for its chip: four flags and "+1".
    expect(more[0]).toBe(1);
    expect(slot.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("keep clear of other marks' boxes, and stand their lowest where there is no room beside one", () => {
    const screen = [at(100, 100), at(103, 101), at(99, 102), at(101, 99)];
    const mags = [5, 4, 3, 2];
    // A pin's box above the stack, three steps up: the stack stands two, its weakest two on the chip.
    const above = { x0: 100, x1: 130, y0: 20, y1: 40 };
    const short = stackFlags(screen, mags, 34, 4, [above]);
    expect(short.more[0]).toBe(3);
    expect(short.slot).toEqual([0, -1, -1, -1]);
    // A pin's box over the line's top itself: the stack still stands, a flag and its chip, joined to nothing.
    const over = { x0: 95, x1: 135, y0: 70, y1: 105 };
    const stands = stackFlags(screen, mags, 34, 4, [over]);
    expect(stands.host).toEqual([0, 0, 0, 0]);
    expect(stands.slot[0]).toBe(0);
    expect(stands.more[0]).toBe(3);
  });

  it('join a stronger stack they would cover, even where a pin stands there too', () => {
    // A strong stack at (100, 100); a weaker quake above it, whose flag would cover both the stack and a pin.
    const screen = [at(100, 100), at(104, 102), at(118, 68)];
    const pin = { x0: 135, x1: 150, y0: 40, y1: 70 };
    const { host, slot } = stackFlags(screen, [6, 5, 3], 34, 4, [pin]);
    expect(host[2]).toBe(0);
    expect(slot[2]).toBe(2);
  });

  it('stand a shorter stack where a stronger column stands above it, the rest on its chip', () => {
    // A strong single flag at (100, 60); four weaker quakes at (110, 120), whose four-step column would reach it.
    const screen = [at(100, 60), at(110, 120), at(112, 122), at(108, 118), at(111, 124)];
    const { host, slot, more, height } = stackFlags(screen, [7, 4, 3.9, 3.8, 3.7]);
    expect(host.slice(1)).toEqual([1, 1, 1, 1]);
    // Room for two steps under the strong flag: the strongest of the four and a chip for the other three.
    expect(more[1]).toBe(3);
    expect(slot.slice(1)).toEqual([0, -1, -1, -1]);
    expect(height[1]).toBe(1);
    const tops = columnOf(screen[1] as { x: number; y: number }, 2);
    expect(tops.y0).toBeGreaterThan(columnOf(screen[0] as { x: number; y: number }, 1).y1);
  });
});

describe('the quakes as marks drawn (the time bar\'s count, the inspector\'s related)', () => {
  it('counts each quake once: its stack\'s chip and its badge are no marks of their own', async () => {
    const { eachDrawnMark } = await import('../drawnMarks');
    const built = buildQuakeFlags([
      { id: 'a', lat: 10, lng: 20, magnitude: 5.1, tooltip: 'M5.1 a' },
      { id: 'b', lat: 10.01, lng: 20.01, magnitude: 4.2, tooltip: 'M4.2 b', atlas: { deaths: 120, deathsOrder: null, tsunami: true } },
    ], null, { type: 'q', label: 'Q' });
    const seen: string[] = [];
    eachDrawnMark([built.group], (mark) => { seen.push(mark.tooltip); });
    expect(seen.sort()).toEqual(['M4.2 b', 'M5.1 a']);
  });
});
