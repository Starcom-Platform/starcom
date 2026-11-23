/**
 * The marks (critique-2026-11-01, OR2, OR13–OR15; plan A4): each kind's cell its icon on its frame, ringed in its
 * kind's colour, and a dot of that colour; a layer's items drawn as icons, dots, pins (a stalk to the icon, raised) or
 * spikes (a bar whose height is the log of its magnitude, with a scale of round values); severity as brightness.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { KIND_ATLAS_ROWS, FALLBACK_KIND, kindCellSvg, kindColour, kindEntry } from '../kindAtlas';
import { buildKindMarks, PIN_HEIGHT, SPIKE_MAX, SPIKE_MIN, spikeHeight, spikeScale, type KindMarkItem } from '../kindMarks';
import { KIND_COLOURS } from '../../../../styles/tokens';
import { KINDS } from '../kindLexicon';

const items: KindMarkItem[] = [
  { id: 'a', lat: 10, lng: 20, kind: 'conflict:kinetic:airstrike', magnitude: 1000, severity: 1, tooltip: 'A strike' },
  { id: 'b', lat: -5, lng: 40, kind: 'earth:geo:earthquake', magnitude: 10, severity: 0.2, tooltip: 'A quake' },
];

describe('the kind atlas', () => {
  it("draws a kind as its icon on its frame, ringed in its kind's colour, and as a dot of that colour", () => {
    const cell = kindCellSvg('conflict:kinetic:airstrike', KIND_ATLAS_ROWS.icon);
    expect(cell).toContain(`stroke="${KIND_COLOURS.conflict}"`);
    expect(cell).toContain('<circle cx="32" cy="32" r="28.5"');
    expect(cell).toContain(KINDS['conflict:kinetic:airstrike'].icon.slice(0, 20));
    expect(kindCellSvg('conflict:forces:troops', KIND_ATLAS_ROWS.icon)).toContain('<polygon points="32,2.5 61.5,32 32,61.5 2.5,32"');
    expect(kindCellSvg('earth:geo:earthquake', KIND_ATLAS_ROWS.dot)).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="22" fill="${KIND_COLOURS.hazards}" stroke="#0A1113" stroke-width="5"/></svg>`);
  });

  it('draws an unknown kind as a plain report, and a kind still to be drawn as its frame alone', () => {
    expect(kindEntry('nonsense')).toBe(KINDS[FALLBACK_KIND]);
    expect(kindColour('nonsense')).toBe(KIND_COLOURS.conflict);
    const toDraw = Object.entries(KINDS).find(([, k]) => !k.icon)![0];
    expect(kindCellSvg(toDraw, KIND_ATLAS_ROWS.icon)).not.toContain('<g ');
  });
});

describe('the marks', () => {
  it("draws icons above the ground, one sprite each, brighter the more severe", () => {
    const built = buildKindMarks(items, { style: 'icon', atlas: null, type: 'test', label: 'Test', cluster: false });
    expect(built.sprites).not.toBeNull();
    const p = built.sprites!.geometry.getAttribute('position');
    expect(p.count).toBe(2);
    const opacity = built.sprites!.geometry.getAttribute('markOpacity');
    expect(opacity.getX(0)).toBeCloseTo(1, 5);
    expect(opacity.getX(1)).toBeCloseTo(0.55 + 0.45 * 0.2, 5);
    expect(built.kindsDrawn.sort()).toEqual(['conflict:kinetic:airstrike', 'earth:geo:earthquake']);
  });

  it('draws dots from the dot row, and pins as stalks up to a raised head', () => {
    const dots = buildKindMarks(items, { style: 'dot', atlas: null, type: 'test', label: 'Test', cluster: false });
    expect(dots.sprites!.geometry.getAttribute('atlasRow').getX(0)).toBe(KIND_ATLAS_ROWS.dot);
    const pins = buildKindMarks(items, { style: 'pin', atlas: null, type: 'test', label: 'Test', cluster: false });
    const head = new THREE.Vector3().fromBufferAttribute(pins.sprites!.geometry.getAttribute('position') as THREE.BufferAttribute, 0);
    expect(head.length()).toBeCloseTo(100 * (1 + PIN_HEIGHT), 4);
    let stalks = 0;
    pins.group.traverse((o) => { if (o.userData?.type === 'test:stalks') stalks++; });
    expect(stalks).toBe(1);
  });

  it('draws spikes as bars whose height is the log of the magnitude, with a scale of round values', () => {
    const built = buildKindMarks(items, { style: 'spike', atlas: null, type: 'test', label: 'Test' });
    expect(built.sprites).toBeNull();
    expect(built.scale).toEqual(spikeScale(1000));
    expect(spikeHeight(0, 1000)).toBe(SPIKE_MIN);
    expect(spikeHeight(1000, 1000)).toBeCloseTo(SPIKE_MAX, 10);
    expect(spikeHeight(10, 1000)).toBeGreaterThan(SPIKE_MIN);
    expect(spikeHeight(10, 1000)).toBeLessThan(spikeHeight(100, 1000));
    expect(spikeScale(4321).map((s) => s.value)).toEqual([1000, 100, 10]);
    expect(spikeScale(5).map((s) => s.value)).toEqual([1]);
  });

  it('draws nothing for no items', () => {
    const built = buildKindMarks([], { style: 'icon', atlas: null, type: 'test', label: 'Test' });
    expect(built.sprites).toBeNull();
    expect(built.group.children).toHaveLength(0);
  });
});

describe("the plain shapes drawn before the atlas is baked", () => {
  it("gives the sprite shader exactly the five fills it holds, whatever the kinds", async () => {
    const { plainFills } = await import('../kindMarks');
    expect(plainFills(null)).toHaveLength(5);
    const many = { texture: null, kinds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], cellOf: () => 0 };
    expect(plainFills(many)).toHaveLength(5);
    const built = buildKindMarks(items, { style: 'icon', atlas: null, type: 'test', label: 'Test', cluster: false });
    const fills = (built.sprites!.material as THREE.ShaderMaterial).uniforms.shapeFills.value as THREE.Color[];
    expect(fills).toHaveLength(5);
    expect(fills.every((c) => c instanceof THREE.Color)).toBe(true);
  });
});
