import { describe, it, expect, vi } from 'vitest';
import { CLICK_TOLERANCE_PX, claimGlobeClicks, countryAt, isGlobeClick, isPrimaryButton, nearerLayerTakes, offerCountryAt, pressOn } from '../globeClick';

describe('isGlobeClick', () => {
  const down = { x: 100, y: 200 };

  it('is a click when the pointer comes up where it went down', () => {
    expect(isGlobeClick(down, { x: 100, y: 200 })).toBe(true);
  });

  it('allows the small wobble of a real click, up to the tolerance', () => {
    expect(isGlobeClick(down, { x: 103, y: 204 })).toBe(true); // exactly 5 px
    expect(CLICK_TOLERANCE_PX).toBe(5);
  });

  it('is not a click once the pointer has travelled: that was a drag to rotate the globe', () => {
    expect(isGlobeClick(down, { x: 104, y: 204 })).toBe(false);
    expect(isGlobeClick(down, { x: 320, y: 240 })).toBe(false);
  });

  it('is not a click when no press was seen, as when a press began over something else', () => {
    expect(isGlobeClick(null, { x: 100, y: 200 })).toBe(false);
  });
});

describe('isPrimaryButton', () => {
  it('is the left button, which is also what a touch or a pen tap reports', () => {
    expect(isPrimaryButton({ button: 0 })).toBe(true);
  });

  it('is never the middle button or the menu button', () => {
    expect(isPrimaryButton({ button: 1 })).toBe(false);
    expect(isPrimaryButton({ button: 2 })).toBe(false);
  });
});

describe('pressOn', () => {
  const canvas = document.createElement('canvas');
  const other = document.createElement('button');
  const at = (button: number, target: EventTarget | null) => ({ button, clientX: 40, clientY: 60, target });

  it('records a primary press on the globe canvas', () => {
    expect(pressOn(at(0, canvas), canvas)).toEqual({ x: 40, y: 60 });
  });

  it('records no press for a right-click on the canvas, so it can never pick', () => {
    // A right-click asks for the globe menu. Picking on it opened a popup over that menu.
    const press = pressOn(at(2, canvas), canvas);
    expect(press).toBeNull();
    expect(isGlobeClick(press, { x: 40, y: 60 })).toBe(false);
  });

  it('records no press for a middle-click on the canvas', () => {
    expect(pressOn(at(1, canvas), canvas)).toBeNull();
  });

  it('records no press that began over something else, or with no canvas to press on', () => {
    expect(pressOn(at(0, other), canvas)).toBeNull();
    expect(pressOn(at(0, canvas), null)).toBeNull();
  });
});

/*
 * The nearer thing takes the click (BA9). The country layer picked a country on
 * every click on the globe, so a click on an Intel Report's glyph opened the
 * report and the country's panel over it; with a menu at the click (K8), the
 * country's panel covered the menu. Measured on the built app, 2026-10-04.
 */
describe('a layer nearer the viewer takes the click', () => {
  const canvas = document.createElement('canvas');
  const press = { button: 0, clientX: 40, clientY: 60, target: canvas };

  it('a glyph under the pointer takes every click: no country, no point beneath it is picked', () => {
    const release = claimGlobeClicks(() => ({ mark: true, area: true }));
    expect(pressOn(press, canvas)).toBeNull();
    expect(pressOn(press, canvas, 'area')).toBeNull();
    release();
    expect(pressOn(press, canvas)).toEqual({ x: 40, y: 60 });
  });

  it('a territory outlined with reports takes a click that would pick a country, not one on a point drawn on it', () => {
    const release = claimGlobeClicks(() => ({ mark: false, area: true }));
    expect(pressOn(press, canvas, 'area')).toBeNull();
    expect(pressOn(press, canvas)).toEqual({ x: 40, y: 60 });
    release();
  });

  it('and says so to a layer that would highlight what is under the pointer', () => {
    const release = claimGlobeClicks(() => ({ mark: false, area: true }));
    expect(nearerLayerTakes('area')).toBe(true);
    expect(nearerLayerTakes('mark')).toBe(false);
    release();
    expect(nearerLayerTakes('area')).toBe(false);
  });

  it('nothing under the pointer takes nothing', () => {
    const release = claimGlobeClicks(() => ({ mark: false, area: false }));
    expect(pressOn(press, canvas, 'area')).toEqual({ x: 40, y: 60 });
    release();
  });
});

/*
 * The country a nearer layer's click passed over (BA20). A territory or an area
 * outlined for its reports takes the click inside it, and a continent's took
 * every country's panel on that continent. The country layer says which
 * country is under a click, and how to open its panel, so the menu there can
 * offer it last.
 */
describe('the country under a click a nearer layer took (BA20)', () => {
  it('is what the country layer offers, asked at the click, and nothing once the layer is gone', () => {
    expect(countryAt({ x: 1, y: 2 })).toBeNull();
    const open = vi.fn();
    const stop = offerCountryAt((at) => (at.x === 1 ? { name: 'Mali', open } : null));
    expect(countryAt({ x: 1, y: 2 })).toEqual({ name: 'Mali', open });
    expect(countryAt({ x: 9, y: 2 })).toBeNull();
    stop();
    expect(countryAt({ x: 1, y: 2 })).toBeNull();
  });

  it('a layer that stops an old offer leaves a newer one in place', () => {
    const first = offerCountryAt(() => ({ name: 'A', open: vi.fn() }));
    const second = offerCountryAt(() => ({ name: 'B', open: vi.fn() }));
    expect(countryAt({ x: 0, y: 0 })?.name).toBe('B');
    first();
    expect(countryAt({ x: 0, y: 0 })?.name).toBe('B');
    second();
    expect(countryAt({ x: 0, y: 0 })).toBeNull();
  });
});

describe('the layers that pick say what they pick', () => {
  it('the countries an area, the cable landings a point', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../../..', file), 'utf8');
    expect(read('src/geopolitical/hooks/useNationalTerritories3D.ts')).toMatch(/pressOn\(e, globeCanvas\(\), 'area'\)/);
    // Nor does a country light up, or offer "Click for details", where a nearer layer takes the click
    // (nor with no pointer at all: useNationalTerritories3D.hover.test.tsx).
    expect(read('src/geopolitical/hooks/useNationalTerritories3D.ts')).toMatch(/const hitIndex = nearerLayerTakes\('area'\) \|\| !pointer \? null :/);
    expect(read('src/hooks/useCommHubs3D.ts')).toMatch(/pressOn\(e, canvas\)/);
    // And the Intel Reports layer says what is under the pointer.
    expect(read('src/components/Globe/Enhanced3DGlobeInteractivity.tsx')).toMatch(/claimGlobeClicks\(/);
    // The country layer offers the country under a click it yields, and the menu there asks (BA20).
    expect(read('src/geopolitical/hooks/useNationalTerritories3D.ts')).toMatch(/offerCountryAt\(/);
    // The menu at the click, moved out of Enhanced3DGlobeInteractivity with the popup flow (ADR-0002).
    expect(read('src/features/globe/interaction/useIntelRlshPopupFlow.ts')).toMatch(/countryAt\(clickPointRef\.current\)/);
  });
});


describe('ranked claims (2026-10-12): a Sector over a Sphere over a country', () => {
  it('a layer yields only to the layers ranked above its own, and the country layer to all', async () => {
    const { CLAIM_RANK, claimGlobeClicks, nearerLayerTakes } = await import('../globeClick');
    const stopZones = claimGlobeClicks(() => ({ mark: false, area: true }), CLAIM_RANK.zones);
    const stopSpheres = claimGlobeClicks(() => ({ mark: false, area: true }), CLAIM_RANK.spheres);
    try {
      expect(nearerLayerTakes('area', CLAIM_RANK.zones)).toBe(false);    // the Zones' own claim and the Spheres' below it
      expect(nearerLayerTakes('area', CLAIM_RANK.spheres)).toBe(true);   // a Sector is nearer than a Sphere
      expect(nearerLayerTakes('area')).toBe(true);                        // the country yields to both
      const stopGlyph = claimGlobeClicks(() => ({ mark: true, area: true }));
      expect(nearerLayerTakes('area', CLAIM_RANK.zones)).toBe(true);     // a glyph, unranked, is nearest of all
      stopGlyph();
    } finally {
      stopZones();
      stopSpheres();
    }
    expect(nearerLayerTakes('area')).toBe(false);
  });
});
