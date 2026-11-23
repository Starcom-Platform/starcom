// GlobeMaterialManager.ts
// AI-NOTE: See globe-shaders.artifact for shader/material documentation.

/**
 * GlobeMaterialManager: Handles all shader/material logic for the Globe Engine.
 * - See globe-shaders.artifact for shader/material documentation and extension.
 */

import * as THREE from 'three';
import { DEFAULT_NIGHT_FILL } from './globeLighting';
import type { GlobeSkin } from '../services/globe/globeAppearance';

/**
 * The textures each skin samples, and nothing else.
 *
 * GlobeEngine loads exactly this list for the skin in use. It loaded all seven
 * Earth textures on every visit, so the default view (Cyber-Earth) downloaded
 * blue-marble, topology and day textures it never drew — 2.04 MB of an 8.55 MB
 * first visit, measured server-side on 2026-09-25.
 *
 * skinTextures.test.ts builds every skin's material from ONLY its list and
 * checks both directions: no texture slot left empty (the list is enough) and
 * every listed texture sampled (nothing is downloaded for nothing). Change
 * getMaterialForSkin and that test says whether this list must change with it.
 */
export const SKIN_TEXTURES: Record<GlobeSkin, readonly string[]> = {
  cyberEarth: ['earthDark', 'earthWater', 'earthNight'],
  dayNight: ['earthDay', 'earthNight', 'earthTopology'],
  blueMarble: ['blueMarble', 'earthTopology', 'earthWater'],
  terrain: ['earthDay', 'earthWater'],
};

export class GlobeMaterialManager {
  private static createDayNightMaterial(
    dayTexture: THREE.Texture,
    nightTexture: THREE.Texture,
    bumpTexture?: THREE.Texture,
    nightFill: number = DEFAULT_NIGHT_FILL
  ): THREE.ShaderMaterial {
    // The bumpMap uniform always needs SOME bound texture (a null sampler2D uniform is
    // invalid once the shader actually samples it, even behind a runtime branch) — fall
    // back to the day texture and force bumpScale to 0 so it's multiplied away to a
    // no-op rather than perturbing normals from nonsense height data.
    const hasBump = Boolean(bumpTexture);
    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTexture },
        nightTexture: { value: nightTexture },
        bumpMap: { value: bumpTexture ?? dayTexture },
        bumpScale: { value: hasBump ? 1.2 : 0 },
        // A direction in the SCENE's frame (globeCoordinates.ts), compared below
        // against a world-space normal. It used to be compared against a
        // view-space normal, which made the terminator swing with the camera.
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        nightFill: { value: nightFill },
        // The 'flat' light mode: no terminator at all (globeAppearance.ts).
        flatLighting: { value: 0 }
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          // World space, not view space: the Sun stands still while the camera
          // moves. mat3(modelMatrix) is enough without the inverse-transpose
          // trick because the globe only ever carries a rotation and a uniform
          // scale — the same argument as territoryFillMaterial.ts.
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D bumpMap;
        uniform float bumpScale;
        uniform vec3 sunDirection;
        uniform float nightFill;
        uniform float flatLighting;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;

        // Bump mapping via screen-space height derivatives — reproduced from three.js's
        // own bumpmap_pars_fragment shader chunk (Mikkelsen's "Bump Mapping
        // Unparametrized Surfaces on the GPU"), not a novel technique: applied ON TOP
        // of the existing diffuse lighting below without changing it, so bumpScale=0
        // (no bump texture provided) reproduces the exact prior look.
        vec2 dHdxy_fwd() {
          vec2 dSTdx = dFdx(vUv);
          vec2 dSTdy = dFdy(vUv);
          float Hll = bumpScale * texture2D(bumpMap, vUv).x;
          float dBx = bumpScale * texture2D(bumpMap, vUv + dSTdx).x - Hll;
          float dBy = bumpScale * texture2D(bumpMap, vUv + dSTdy).x - Hll;
          return vec2(dBx, dBy);
        }

        vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
          vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
          vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN);
          vec3 R2 = cross(vN, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }

        void main() {
          vec3 n = normalize(vWorldNormal);
          if (bumpScale > 0.0) {
            n = perturbNormalArb(vWorldPosition, n, dHdxy_fwd(), gl_FrontFacing ? 1.0 : -1.0);
          }
          vec3 l = normalize(sunDirection);
          float intensity = dot(n, l);
          float blend = mix(smoothstep(-0.2, 0.25, intensity), 1.0, flatLighting);
          vec4 dayColor = texture2D(dayTexture, vUv);
          vec4 nightColor = texture2D(nightTexture, vUv);
          // The night side is the city lights, plus a little of the day texture:
          // a terminator with nothing behind it makes half the marks on the globe
          // unreadable. See DEFAULT_NIGHT_FILL in globeLighting.ts.
          vec3 lit = mix(nightColor.rgb, dayColor.rgb, blend);
          lit += dayColor.rgb * nightFill * (1.0 - blend);
          gl_FragColor = vec4(lit, 1.0);
          /*
           * A raw ShaderMaterial writes linear values and three.js converts only for
           * materials that include this chunk — without it the whole planet came out
           * dark, which is how the day/night skin had always looked.
           */
          gl_FragColor = sRGBTransferOETF( gl_FragColor );
        }
      `
    });
  }

  /**
   * The Cyber-Earth skin: the planet as an instrument reading rather than a photograph.
   *
   * What was here before was a MeshPhongMaterial with a cyan `color` over the dark
   * earth texture, which rendered as a dim grey-blue planet — the tint multiplies a
   * texture that is nearly black over the oceans, so there was almost nothing to tint.
   * This lights land and water separately off the water mask, puts the city lights on
   * the night side in amber, adds the Fresnel rim that made the (unused, now deleted)
   * TinyGlobe hologram shader read as a hologram, and lays a 15° graticule over it.
   */
  private static createCyberEarthMaterial(
    baseTexture: THREE.Texture,
    waterTexture: THREE.Texture,
    nightTexture: THREE.Texture,
    nightFill: number,
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: baseTexture },
        waterTexture: { value: waterTexture },
        nightTexture: { value: nightTexture },
        sunDirection: { value: new THREE.Vector3(0, 0, 1) },
        nightFill: { value: nightFill },
        flatLighting: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D waterTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        uniform float nightFill;
        uniform float flatLighting;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;

        void main() {
          vec3 n = normalize(vWorldNormal);
          // The water mask is white over ocean, black over land.
          float ocean = texture2D(waterTexture, vUv).r;
          float relief = texture2D(baseTexture, vUv).r;

          vec3 landColor = mix(vec3(0.05, 0.55, 0.55), vec3(0.35, 0.95, 0.85), relief);
          vec3 oceanColor = vec3(0.02, 0.09, 0.16);
          vec3 color = mix(landColor, oceanColor, ocean);

          // Coastlines read as the bright edge of the mask.
          float coast = 1.0 - abs(ocean - 0.5) * 2.0;
          color += vec3(0.0, 0.45, 0.5) * pow(max(coast, 0.0), 3.0);

          /*
           * The graticule (critique C29): a line every 15° of latitude and longitude, on the true lines, about a
           * pixel wide at any zoom, and the circles that matter brighter: the equator, the tropics at 23.44° and
           * the polar circles at 66.56°. It was drawn at the middle of each 15° cell, so every line stood 7.5° off
           * a real one and there was no equator. The UVs are the textures' own: longitude from -180° at u = 0,
           * latitude from -90° at v = 0.
           */
          float lat = (vUv.y - 0.5) * 180.0;
          float lng = vUv.x * 360.0 - 180.0;
          float pxLat = max(fwidth(lat), 1e-4);
          float pxLng = max(fwidth(lng), 1e-4);
          float offLat = abs(lat - 15.0 * floor(lat / 15.0 + 0.5));
          float offLng = abs(lng - 15.0 * floor(lng / 15.0 + 0.5));
          float line = max(1.0 - smoothstep(0.0, pxLat * 1.2, offLat), 1.0 - smoothstep(0.0, pxLng * 1.2, offLng));
          color += vec3(0.0, 0.20, 0.24) * line;
          // As maps draw them: the equator solid and a little brighter, the tropics and polar circles dashed.
          float onEquator = 1.0 - smoothstep(pxLat * 0.4, pxLat * 1.6, abs(lat));
          float offCircle = min(abs(abs(lat) - 23.4365), abs(abs(lat) - 66.5635));
          float onCircle = (1.0 - smoothstep(0.0, pxLat * 1.2, offCircle)) * step(0.45, fract(lng / 3.0));
          color += vec3(0.0, 0.14, 0.17) * onEquator + vec3(0.0, 0.22, 0.26) * onCircle;

          float day = mix(smoothstep(-0.2, 0.25, dot(n, normalize(sunDirection))), 1.0, flatLighting);
          color *= mix(0.25 + nightFill, 1.0, day);
          // City lights, only where the Sun is not.
          color += texture2D(nightTexture, vUv).rgb * vec3(1.0, 0.72, 0.35) * (1.0 - day) * 0.9;

          // The Fresnel rim: bright where the surface turns away from the eye.
          vec3 toEye = normalize(cameraPosition - vWorldPosition);
          float rim = pow(1.0 - max(dot(n, toEye), 0.0), 2.5);
          color += vec3(0.1, 0.75, 0.85) * rim * 0.8;

          gl_FragColor = vec4(color, 1.0);
          gl_FragColor = sRGBTransferOETF( gl_FragColor );
        }
      `,
    });
  }

  /**
   * The Terrain skin: relief in neutral greys, so a coloured mark on top of it is the
   * only saturated thing in the frame. What a card wants when the data is the subject.
   */
  private static createTerrainMaterial(
    dayTexture: THREE.Texture,
    waterTexture: THREE.Texture,
    nightFill: number,
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTexture },
        waterTexture: { value: waterTexture },
        sunDirection: { value: new THREE.Vector3(0, 0, 1) },
        nightFill: { value: nightFill },
        flatLighting: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D waterTexture;
        uniform vec3 sunDirection;
        uniform float nightFill;
        uniform float flatLighting;
        varying vec3 vWorldNormal;
        varying vec2 vUv;

        void main() {
          vec3 albedo = texture2D(dayTexture, vUv).rgb;
          float luminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
          float ocean = texture2D(waterTexture, vUv).r;
          // Land in warm grey, water a shade cooler and flatter, so the coast still reads.
          vec3 land = mix(vec3(0.16, 0.155, 0.145), vec3(0.78, 0.77, 0.74), luminance);
          vec3 water = vec3(0.10, 0.12, 0.15);
          vec3 color = mix(land, water, ocean);

          float day = mix(smoothstep(-0.2, 0.25, dot(normalize(vWorldNormal), normalize(sunDirection))), 1.0, flatLighting);
          color *= mix(0.2 + nightFill, 1.0, day);
          gl_FragColor = vec4(color, 1.0);
          gl_FragColor = sRGBTransferOETF( gl_FragColor );
        }
      `,
    });
  }

  /**
   * The material for a skin. Every skin is lit from one direction — including Blue
   * Marble, which was a MeshBasicMaterial, i.e. unlit: no light mode could touch it
   * and it showed full daylight at midnight.
   */
  static getMaterialForSkin(
    skin: GlobeSkin,
    textures: Record<string, THREE.Texture>,
    nightFill: number = DEFAULT_NIGHT_FILL,
  ): THREE.Material {
    const night = textures.earthNightTexture || textures.earthDarkTexture || textures.earthDayTexture;
    switch (skin) {
      case 'cyberEarth':
        return this.createCyberEarthMaterial(
          textures.earthDarkTexture || textures.earthDayTexture,
          textures.earthWaterTexture,
          night,
          nightFill,
        );
      case 'terrain':
        return this.createTerrainMaterial(textures.earthDayTexture, textures.earthWaterTexture, nightFill);
      case 'blueMarble':
        // Phong, not Basic: the bump map gives real relief at mountain ranges and the
        // water mask gives the oceans a specular highlight, and the Sun reaches both.
        return new THREE.MeshPhongMaterial({
          map: textures.blueMarbleTexture || textures.earthDayTexture,
          bumpMap: textures.earthTopologyTexture,
          bumpScale: 0.6,
          specularMap: textures.earthWaterTexture,
          specular: 0x223344,
          shininess: 8,
        });
      case 'dayNight':
      default:
        return this.createDayNightMaterial(
          textures.earthDayTexture,
          // The city lights. earth-night.jpg shipped in every bundle from the
          // start and was never loaded: this asked for earthDark, a flat dark
          // landmass, so the night side showed no cities at all.
          night,
          textures.earthTopologyTexture,
          nightFill,
        );
    }
  }

  /**
   * Where the light comes from, and how much of the night side still reads. One call
   * for every skin: the shader skins carry their own terminator in a uniform, and the
   * Phong skins get theirs from the scene's light rig (globeLighting.ts).
   */
  static applyLighting(
    material: THREE.Material | null,
    lighting: { direction: THREE.Vector3; nightFill: number; flat: boolean },
  ): void {
    if (!material || !(material instanceof THREE.ShaderMaterial)) return;
    const uniforms = material.uniforms as Record<string, { value: unknown }> | undefined;
    if (!uniforms) return;
    if (uniforms.sunDirection) uniforms.sunDirection.value = lighting.direction.clone().normalize();
    if (uniforms.nightFill) uniforms.nightFill.value = lighting.nightFill;
    if (uniforms.flatLighting) uniforms.flatLighting.value = lighting.flat ? 1 : 0;
  }

  /**
   * Dispose of material resources
   */
  static disposeMaterial(material: THREE.Material) {
    material.dispose();
  }
}
