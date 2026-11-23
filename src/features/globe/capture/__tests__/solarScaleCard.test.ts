/**
 * A card of the solar system says its scale (critique-2026-11-01, OR9; capture schema 33): the record names the scale
 * whenever the picture drew any of the solar system, and at Compact a caveat says which distances are not true. At
 * True, and where none of it was drawn, there is nothing to say.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildGlobeViewProvenance,
  GLOBE_CAPTURE_SCHEMA_VERSION,
  SOLAR_COMPACT_CAVEAT,
  SOLAR_COMPACT_CAVEAT_SHORT,
  SOLAR_DIAGRAM_CAVEAT,
  SOLAR_DIAGRAM_CAVEAT_SHORT,
  type BuildProvenanceInput,
} from '../shareCardProvenance';

const AT = new Date('2026-11-01T12:00:00.000Z');
const input = (solarSystem?: { scale: 'compact' | 'true' | 'diagram' }): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 0, lon: 0, altitude: 20000 },
  frame: { width: 1200, height: 630 },
  layers: [{ label: 'Space Weather', active: true, implemented: true }],
  feeds: [],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  now: AT,
  appearance: { skin: 'Blue Marble', lightMode: 'sun', ...(solarSystem ? { solarSystem } : {}) },
});

describe("a card's solar system scale", () => {
  it('is schema 33', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(33);
  });

  it('records the scale and, at Compact, says which distances are not true', () => {
    const card = buildGlobeViewProvenance(input({ scale: 'compact' }));
    expect(card.appearance?.solarSystem).toEqual({ scale: 'compact' });
    const i = card.caveats.indexOf(SOLAR_COMPACT_CAVEAT);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(card.caveatsShort[i]).toBe(SOLAR_COMPACT_CAVEAT_SHORT);
    expect(SOLAR_COMPACT_CAVEAT_SHORT.length).toBeLessThanOrEqual(90);
  });

  it('says a Diagram is not to scale (schema 34)', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(34);
    const card = buildGlobeViewProvenance(input({ scale: 'diagram' }));
    expect(card.appearance?.solarSystem).toEqual({ scale: 'diagram' });
    const i = card.caveats.indexOf(SOLAR_DIAGRAM_CAVEAT);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(card.caveatsShort[i]).toBe(SOLAR_DIAGRAM_CAVEAT_SHORT);
    expect(card.caveats).not.toContain(SOLAR_COMPACT_CAVEAT);
  });

  it('says nothing more at True, nor where none of the solar system was drawn', () => {
    const atTrue = buildGlobeViewProvenance(input({ scale: 'true' }));
    expect(atTrue.appearance?.solarSystem).toEqual({ scale: 'true' });
    expect(atTrue.caveats).not.toContain(SOLAR_COMPACT_CAVEAT);
    const none = buildGlobeViewProvenance(input());
    expect(none.appearance?.solarSystem).toBeUndefined();
    expect(none.caveats).not.toContain(SOLAR_COMPACT_CAVEAT);
  });
});
