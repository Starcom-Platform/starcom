/**
 * Which textures each skin needs — declared once, and held to the material.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * GlobeEngine.init() loaded all seven Earth textures on every visit, whichever
 * skin was showing. Measured server-side on 2026-09-25 with production's
 * compression: a first visit in the default view (Cyber-Earth) downloaded
 * blue-marble, topology and day textures it never drew — 2.04 MB of an
 * 8.55 MB first visit, paid by every new human visitor.
 *
 * Loading only what the skin needs requires a list of what each skin needs, and
 * a list that can drift from the material code is worse than no list: too short
 * and a skin renders with a missing texture; too long and the saving quietly
 * disappears. So the list is checked against the materials in BOTH directions.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GlobeMaterialManager, SKIN_TEXTURES } from '../GlobeMaterialManager';
import type { GlobeSkin } from '../../services/globe/globeAppearance';

const SKINS: GlobeSkin[] = ['cyberEarth', 'dayNight', 'blueMarble', 'terrain'];

/** Only the textures a skin declares, each tagged with its own name. */
function declaredOnly(skin: GlobeSkin): Record<string, THREE.Texture> {
  const textures: Record<string, THREE.Texture> = {};
  for (const name of SKIN_TEXTURES[skin]) {
    const t = new THREE.Texture();
    t.name = name;
    textures[`${name}Texture`] = t;
  }
  return textures;
}

const ALL_EARTH_TEXTURES = ['earthDay', 'earthNight', 'blueMarble', 'earthDark', 'earthTopology', 'earthWater'];

/** Every Earth texture, each tagged with its own name. */
function everyTexture(): Record<string, THREE.Texture> {
  const textures: Record<string, THREE.Texture> = {};
  for (const name of ALL_EARTH_TEXTURES) {
    const t = new THREE.Texture();
    t.name = name;
    textures[`${name}Texture`] = t;
  }
  return textures;
}

/** Every texture a material actually samples, and every texture slot left empty. */
function inspect(material: THREE.Material) {
  const used = new Set<string>();
  const emptySlots: string[] = [];
  const consider = (slot: string, value: unknown) => {
    if (value instanceof THREE.Texture) used.add(value.name);
    else if (value === undefined || value === null) emptySlots.push(slot);
  };
  if (material instanceof THREE.ShaderMaterial) {
    for (const [key, uniform] of Object.entries(material.uniforms)) {
      if (/texture|map/i.test(key)) consider(key, (uniform as { value: unknown }).value);
    }
  }
  const phong = material as THREE.MeshPhongMaterial;
  for (const slot of ['map', 'bumpMap', 'specularMap'] as const) {
    if (slot in phong && !(material instanceof THREE.ShaderMaterial)) consider(slot, phong[slot]);
  }
  return { used, emptySlots };
}

describe('SKIN_TEXTURES', () => {
  it.each(SKINS)('%s: declared textures are enough — no slot is left empty', (skin) => {
    const material = GlobeMaterialManager.getMaterialForSkin(skin, declaredOnly(skin));
    expect(inspect(material).emptySlots).toEqual([]);
  });

  it.each(SKINS)('%s: given every texture, it samples exactly the declared ones', (skin) => {
    /*
     * With EVERY texture on offer, not just the declared ones. Built from the
     * declared set alone, a fallback chain hides an omission: Cyber-Earth's
     * night slot falls back to the dark texture, so dropping earthNight from
     * the list would have passed while the night side silently lost its city
     * lights. Given everything, the material picks what it really wants, and
     * that must equal the list — too few is a visual regression, too many is
     * a download for nothing.
     */
    const material = GlobeMaterialManager.getMaterialForSkin(skin, everyTexture());
    expect([...inspect(material).used].sort()).toEqual([...SKIN_TEXTURES[skin]].sort());
  });

  it('the default view needs 3 of the 7 Earth textures', () => {
    // CyberCommand's auto skin. The number the saving rests on, stated so a
    // change to it is a visible decision rather than a silent regression.
    expect([...SKIN_TEXTURES.cyberEarth].sort()).toEqual(['earthDark', 'earthNight', 'earthWater']);
  });

  it('no skin asks for the clouds, which the cloud layer owns', () => {
    for (const skin of SKINS) expect(SKIN_TEXTURES[skin]).not.toContain('clouds');
  });
});
