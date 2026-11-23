/**
 * The mini-globe on a 2D canvas (decision D-MG, MG1): seen as the WebGL minimap sees it, a click finds
 * the place under it, and each skin is lit by the Sun as its shader lights it.
 */
import { describe, expect, it } from 'vitest';
import { discRadius, drawMinimapPixels, pickMinimap, projectToMinimap, sunPlaceOf, type MinimapTextureName, type Pixels } from '../minimapPixels';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';

const SIZE = 110;
const flat = (r: number, g: number, b: number): Pixels => {
  const data = new Uint8ClampedArray(8 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: 8, height: 4, data };
};
const canvas = (size = SIZE): Pixels => ({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4) });
const at = (px: Pixels, x: number, y: number) => Array.from(px.data.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));
const centre = (px: Pixels) => at(px, px.width / 2, px.height / 2);
const LIGHT = (sun: { lat: number; lng: number }) => ({ sun, nightFill: 0.15 });

describe('the 2D minimap\'s geometry', () => {
  it('is as wide as the WebGL minimap draws it, from 3 radii through a 50° lens', () => {
    expect(discRadius(SIZE)).toBeCloseTo(41.7, 1);
  });

  it('has the pose at its centre, east to the right and north up', () => {
    const pose = { lat: 10, lng: 20 };
    const c = projectToMinimap(10, 20, pose, SIZE);
    expect(c.x).toBeCloseTo(SIZE / 2, 6);
    expect(c.y).toBeCloseTo(SIZE / 2, 6);
    expect(projectToMinimap(10, 30, pose, SIZE).x).toBeGreaterThan(SIZE / 2 + 5);
    expect(projectToMinimap(20, 20, pose, SIZE).y).toBeLessThan(SIZE / 2 - 5);
  });

  it('finds the place under a click, and nothing off the disc', () => {
    const pose = { lat: -15, lng: 170 };
    for (const [lat, lng] of [[-15, 170], [10, -175], [-50, 150], [20, 160]]) {
      const { x, y, front } = projectToMinimap(lat, lng, pose, SIZE);
      expect(front).toBe(true);
      const place = pickMinimap(x, y, SIZE, pose)!;
      expect(place.lat).toBeCloseTo(lat, 6);
      expect(((place.lng - lng + 540) % 360) - 180).toBeCloseTo(0, 6);
    }
    expect(pickMinimap(2, 2, SIZE, pose)).toBeNull();
  });

  it('sees the cap 70.5° round its pose, as a camera 3 radii out does', () => {
    const pose = { lat: 0, lng: 0 };
    expect(projectToMinimap(0, 65, pose, SIZE).front).toBe(true);
    expect(projectToMinimap(0, 75, pose, SIZE).front).toBe(false);
    expect(projectToMinimap(0, 180, pose, SIZE).front).toBe(false);
  });

  it('reads the Sun\'s place from its direction in the scene\'s frame', () => {
    const v = latLngToGlobeWorld(23, -45, 1);
    const place = sunPlaceOf(v);
    expect(place.lat).toBeCloseTo(23, 6);
    expect(place.lng).toBeCloseTo(-45, 6);
  });
});

describe('the 2D minimap\'s pixels', () => {
  const textures: Record<MinimapTextureName, Pixels> = {
    earthDay: flat(200, 200, 200),
    earthNight: flat(255, 255, 255),
    blueMarble: flat(200, 200, 200),
    earthDark: flat(128, 128, 128),
    earthWater: flat(0, 0, 0),
  };

  it('leaves the corners clear and fills the disc', () => {
    const px = canvas();
    drawMinimapPixels(px, 'dayNight', textures, { lat: 0, lng: 0 }, LIGHT({ lat: 0, lng: 0 }));
    expect(at(px, 0, 0)[3]).toBe(0);
    expect(centre(px)[3]).toBe(255);
  });

  it('day and night: the day map where the Sun is overhead, the city lights where it is not', () => {
    const noLights = { ...textures, earthNight: flat(0, 0, 0) };
    const noon = canvas();
    drawMinimapPixels(noon, 'dayNight', noLights, { lat: 0, lng: 0 }, LIGHT({ lat: 0, lng: 0 }));
    expect(centre(noon)[0]).toBeGreaterThanOrEqual(198);
    expect(centre(noon)[0]).toBeLessThanOrEqual(202);
    const midnight = canvas();
    drawMinimapPixels(midnight, 'dayNight', noLights, { lat: 0, lng: 180 }, LIGHT({ lat: 0, lng: 0 }));
    // A little of the day map still reads (the night fill): 15% of its light.
    expect(centre(midnight)[0]).toBeGreaterThan(60);
    expect(centre(midnight)[0]).toBeLessThan(100);
    const lights = canvas();
    drawMinimapPixels(lights, 'dayNight', textures, { lat: 0, lng: 180 }, LIGHT({ lat: 0, lng: 0 }));
    expect(centre(lights)[0]).toBe(255);
  });

  it('Cyber Earth: amber city lights on the night side only', () => {
    const night = canvas();
    drawMinimapPixels(night, 'cyberEarth', textures, { lat: 5, lng: 177 }, LIGHT({ lat: 0, lng: 0 }));
    const [r, g, b] = centre(night);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    const day = canvas();
    drawMinimapPixels(day, 'cyberEarth', textures, { lat: 5, lng: 3 }, LIGHT({ lat: 0, lng: 0 }));
    const [dr, dg, db] = centre(day);
    // By day the land's cyan: green and blue over red.
    expect(dg).toBeGreaterThan(dr);
    expect(db).toBeGreaterThan(dr);
  });

  it('Terrain: neutral greys, dimmed at night', () => {
    const day = canvas();
    drawMinimapPixels(day, 'terrain', textures, { lat: 5, lng: 3 }, LIGHT({ lat: 0, lng: 0 }));
    const night = canvas();
    drawMinimapPixels(night, 'terrain', textures, { lat: 5, lng: 177 }, LIGHT({ lat: 0, lng: 0 }));
    const [r, g, b] = centre(day);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
    expect(centre(night)[1]).toBeLessThan(g * 0.7);
  });

  it('Blue Marble: lit by the Sun, its night side by a blue ambient', () => {
    const day = canvas();
    drawMinimapPixels(day, 'blueMarble', textures, { lat: 0, lng: 0 }, LIGHT({ lat: 0, lng: 0 }));
    const night = canvas();
    drawMinimapPixels(night, 'blueMarble', textures, { lat: 0, lng: 180 }, LIGHT({ lat: 0, lng: 0 }));
    expect(centre(day)[0]).toBeGreaterThan(centre(night)[0] * 2);
    const [r, , b] = centre(night);
    expect(b).toBeGreaterThan(r);
  });

  it('refuses a skin whose texture was not read', () => {
    expect(() => drawMinimapPixels(canvas(), 'blueMarble', { earthDay: textures.earthDay }, { lat: 0, lng: 0 }, LIGHT({ lat: 0, lng: 0 })))
      .toThrow('The blueMarble minimap needs blueMarble, which was not read.');
  });
});
