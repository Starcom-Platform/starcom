/**
 * Who made each image the globe draws, and which are drawn now (decisions TX8–TX12;
 * imagery.ts): every texture the engine can draw has a maker, and a card credits only
 * what is drawn.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IMAGERY, IMAGE_SOURCES, imageryDrawn, resetImageryForTests, setCloudsDrawn, setSolarSystemDrawn, setSurfaceImagery,
} from '../imagery';
import { SKIN_TEXTURES } from '../GlobeMaterialManager';
import { creditLine, imageryShown } from '../../features/globe/capture/sourceCredits';
import type { GlobeSkin } from '../../services/globe/globeAppearance';

beforeEach(() => resetImageryForTests());

/** What a card names for a skin's maps, as the engine lists them. */
const namedFor = (skin: GlobeSkin) => {
  setSurfaceImagery(SKIN_TEXTURES[skin]);
  return imageryShown(imageryDrawn().map((id) => IMAGERY[id].source));
};

describe('every image the globe draws has a maker', () => {
  it('covers each map every skin draws, the clouds, the planets and the Moon', () => {
    const drawn = new Set([...Object.values(SKIN_TEXTURES).flat(), 'clouds', 'planets', 'moon']);
    expect([...drawn].filter((name) => !(name in IMAGERY))).toEqual([]);
  });

  it('links each maker and each licence, and says what Starcom changed', () => {
    for (const [id, image] of Object.entries(IMAGERY)) {
      expect(image.source.url, id).toMatch(/^https:\/\//);
      if ('licence' in image.source) expect(image.source.licence.url, id).toMatch(/^https:\/\//);
      expect(image.changes.length, id).toBeGreaterThan(0);
    }
  });

  it('never calls NASA imagery public domain: NASA makes it available under its media guidelines', () => {
    const nasa = Object.values(IMAGE_SOURCES).filter((source) => source.text === 'NASA');
    expect(nasa.length).toBeGreaterThan(0);
    for (const source of nasa) expect('licence' in source).toBe(false);
    expect(JSON.stringify(IMAGERY)).not.toMatch(/public domain/i);
  });
});

describe('what a card names, skin by skin', () => {
  it('Day / Night: Solar System Scope for the day and night, NASA for the relief', () => {
    expect(namedFor('dayNight')).toEqual(['Solar System Scope (CC BY 4.0)', 'NASA']);
  });

  it('Blue Marble: NASA alone, for the surface, the relief and the water mask', () => {
    expect(namedFor('blueMarble')).toEqual(['NASA']);
  });

  it("Cyber-Earth: Google's dark base under its licence, NASA's water mask, Solar System Scope's city lights", () => {
    expect(namedFor('cyberEarth')).toEqual(['Google Data Arts Team (Apache 2.0)', 'NASA', 'Solar System Scope (CC BY 4.0)']);
  });

  it('Terrain: Solar System Scope for the day, NASA for the water', () => {
    expect(namedFor('terrain')).toEqual(['Solar System Scope (CC BY 4.0)', 'NASA']);
  });
});

describe('what is drawn now', () => {
  it('is nothing until something says it draws', () => {
    expect(imageryDrawn()).toEqual([]);
  });

  it("keeps the surface's maps that it knows, then the clouds, then the planets and the Moon, while each is drawn", () => {
    setSurfaceImagery(['earthDay', 'somethingElse', 'earthNight']);
    expect(imageryDrawn()).toEqual(['earthDay', 'earthNight']);
    setCloudsDrawn(true);
    setSolarSystemDrawn(true);
    expect(imageryDrawn()).toEqual(['earthDay', 'earthNight', 'clouds', 'planets', 'moon']);
    setCloudsDrawn(false);
    setSolarSystemDrawn(false);
    expect(imageryDrawn()).toEqual(['earthDay', 'earthNight']);
  });

  it("credits the planets' maker and the Moon's only while the solar system is faded in", () => {
    setSurfaceImagery(SKIN_TEXTURES.blueMarble);
    setSolarSystemDrawn(true);
    expect(imageryShown(imageryDrawn().map((id) => IMAGERY[id].source))).toEqual(['NASA', creditLine(IMAGE_SOURCES.solarSystemScope)]);
  });
});
