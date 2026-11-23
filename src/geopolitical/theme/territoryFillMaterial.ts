// territoryFillMaterial.ts — a single custom ShaderMaterial for national-territory
// fills, replacing the previous MeshBasicMaterial for both the baked and legacy
// runtime render paths (see NationalTerritoriesService.ts).
//
// Why a custom shader instead of a stock lit material (MeshStandardMaterial etc):
// when the fills were built, the scene's sun and ambient lights came from the solar
// system, which was drawn only in EcoNatural and CyberCommand (non-IntelReports)
// modes — NOT GeoPolitical, which is the mode territories are built for — and a
// stock lit material renders pure black wherever no real THREE.Light is present.
// The globe sphere itself sidesteps this the same way:
// GlobeMaterialManager's dayNight material is a hand-rolled ShaderMaterial driven
// by a `sunDirection` uniform, not real scene lights. This mirrors that pattern —
// self-contained, unaffected by (and not affecting) any other scene lighting.
//
// This also folds in colorScheme-driven fill color and the QA-honesty dev overlay
// (both just "what value seeds a uniform"), and replaces the old per-frame JS
// THREE.Color.lerp()-based hover/select/dim blending with the equivalent math
// computed once per fragment in-shader — same visual behavior, computed on the GPU
// instead of mutated from the render loop every frame.
import * as THREE from 'three';

const HIGHLIGHT_COLOR = new THREE.Color(0x88bbff);
const DEFAULT_SUN_DIRECTION = new THREE.Vector3(0.5, 0.4, 0.6).normalize();

const VERTEX_SHADER = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  // Many parts in one mesh (geometry/territoryBatch.ts): colour and QA tint come per
  // vertex, and hover/select/dim per part from a texture, one texel a part.
  #ifdef TERRITORY_PARTS
    attribute float aPart;
    attribute vec3 aBaseColor;
    attribute vec4 aQaTint;
    uniform sampler2D uPartState;
    uniform float uPartStateWidth;
    varying vec3 vBaseColor;
    varying vec4 vQaTint;
    varying vec3 vPartState;
  #endif

  void main() {
    #ifdef TERRITORY_PARTS
      int part = int(aPart + 0.5);
      int width = int(uPartStateWidth);
      vPartState = texelFetch(uPartState, ivec2(part % width, part / width), 0).rgb;
      vBaseColor = aBaseColor;
      vQaTint = aQaTint;
    #endif

    // World-space normal, not view-space: the territories group carries its own
    // counter-rotation (see applyGeoPoliticalSceneCounterOffset) independent of
    // camera orientation, so a view-space normal compared against a world-space
    // sun direction would be misaligned by that rotation. mat3(modelMatrix) is
    // safe here without the inverse-transpose trick since the group only ever
    // applies a uniform scale (TERRITORY_RADIUS_SCALE), no shear/non-uniform scale.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uBaseColor;
  uniform float uOneColour;
  uniform float uOpacity;
  uniform float uHoverT;
  uniform float uSelectT;
  uniform float uDimT;
  uniform vec3 uSunDirection;
  /** How strongly the sun shades the fill, 0–1: 0 is flat, 1 today's (decision K5, step 5). */
  uniform float uShading;
  uniform vec3 uQaTintColor;
  uniform float uQaTintStrength;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  #ifdef TERRITORY_PARTS
    varying vec3 vBaseColor;
    varying vec4 vQaTint;
    varying vec3 vPartState;
    // Each part's own colour (Classic), or every part in uBaseColor (Quiet): see
    // setTerritoryMaterialOneColour. A uniform, so a card drawn in another style
    // than the screen's switches without a rebuild (globe-engine/territoryLook.ts).
    // A select, not mix(): mix(x, y, 1.0) may be computed as x + (y - x), which is not
    // always exactly y, and the Quiet cards are compared pixel for pixel with their goldens.
    #define BASE_COLOR (uOneColour > 0.5 ? uBaseColor : vBaseColor)
    #define HOVER_T vPartState.r
    #define SELECT_T vPartState.g
    #define DIM_T vPartState.b
    #define QA_TINT_COLOR vQaTint.rgb
    #define QA_TINT_STRENGTH vQaTint.a
  #else
    #define BASE_COLOR uBaseColor
    #define HOVER_T uHoverT
    #define SELECT_T uSelectT
    #define DIM_T uDimT
    #define QA_TINT_COLOR uQaTintColor
    #define QA_TINT_STRENGTH uQaTintStrength
  #endif

  void main() {
    /*
     * The far side of the shell, discarded here as well as hidden by the depth buffer.
     *
     * These fills were a decal, with depth testing off. The bake used to lift only each
     * triangle's corners onto the sphere, so flat interiors sagged below the surface
     * (worst case 3.9 units: Canada, the US, Australia, Antarctica) and the globe punched
     * them out — the black patches over Algeria, Angola, Kenya and Iberia. With depth
     * testing off, this discard kept the far hemisphere from showing through the planet.
     *
     * The bake is fitted to the sphere now (geometry/sphereFitSubdivision.ts: no shipped
     * triangle sags more than 0.06 units), and the camera's near plane is raised so the
     * 0.2-unit gap above the surface resolves (CAMERA_NEAR in globeAltitudes.ts). So
     * depth testing is back on. Compared in the running app on 2026-09-12 before
     * switching: without it, these transparent fills, drawn after every opaque object,
     * painted over the 3D report models floating above them and tinted each model the
     * colour of the country beneath. With it, the models kept their own colour, and a far
     * view showed no flicker between frames. The discard stays as a cheap early-out.
     */
    if (dot(normalize(vWorldPosition), normalize(vWorldPosition - cameraPosition)) > 0.0) discard;

    vec3 n = normalize(vWorldNormal);
    // DoubleSide rendering doesn't auto-flip custom-shader normals the way it
    // does for built-in materials — flip explicitly so whichever face is being
    // viewed is the one that gets lit, not always the geometric front face.
    if (!gl_FrontFacing) n = -n;

    vec3 l = normalize(uSunDirection);
    float ndotl = dot(n, l);
    // This is a translucent HUD overlay, not a literal lit terrain surface — a
    // gentle [0.7, 1.15] range keeps the unlit side legibly present rather than
    // going full day/night black, while still giving the fill a sense of shape.
    float lightFactor = mix(1.0, mix(0.7, 1.15, smoothstep(-0.3, 0.6, ndotl)), uShading);

    // Mirrors the pre-shader JS hover/select/dim math exactly (same constants),
    // just computed per-fragment instead of mutated on the material every frame.
    float hoverBoost = 0.12 * HOVER_T;
    float selectBoost = 0.25 * SELECT_T;
    float brighten = min(0.35, hoverBoost + selectBoost);
    vec3 color = mix(BASE_COLOR, ${`vec3(${HIGHLIGHT_COLOR.r.toFixed(6)}, ${HIGHLIGHT_COLOR.g.toFixed(6)}, ${HIGHLIGHT_COLOR.b.toFixed(6)})`}, brighten);
    color *= lightFactor;
    color = mix(color, QA_TINT_COLOR, QA_TINT_STRENGTH);

    float dimFactor = 1.0 - 0.3 * DIM_T;
    float alpha = clamp((uOpacity + hoverBoost + selectBoost) * dimFactor, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);

  // Linear out, sRGB on screen — see screenPoints.ts for the same conversion.
  gl_FragColor = sRGBTransferOETF( gl_FragColor );
  }
`;

export interface TerritoryFillMaterialOptions {
  baseColorHex: number;
  opacity: number;
  side?: THREE.Side;
  usePolygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  /**
   * For a mesh of many parts: the per-part hover/select/dim texture. Colour and QA
   * tint are then read from the geometry, and baseColorHex and the per-material
   * hover/select/dim/tint setters no longer apply.
   */
  partState?: THREE.DataTexture;
}

export function createTerritoryFillMaterial(opts: TerritoryFillMaterialOptions): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    defines: opts.partState ? { TERRITORY_PARTS: '' } : {},
    uniforms: {
      uBaseColor: { value: new THREE.Color(opts.baseColorHex) },
      uOneColour: { value: 0 },
      uOpacity: { value: opts.opacity },
      uHoverT: { value: 0 },
      uSelectT: { value: 0 },
      uDimT: { value: 0 },
      uSunDirection: { value: DEFAULT_SUN_DIRECTION.clone() },
      uShading: { value: 1 },
      uQaTintColor: { value: new THREE.Color(0x000000) },
      uQaTintStrength: { value: 0 },
      uPartState: { value: opts.partState ?? null },
      uPartStateWidth: { value: opts.partState?.image.width ?? 1 }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    // Depth-tested; the far-side discard in the fragment shader says why it once was not.
    depthTest: true,
    side: opts.side ?? THREE.DoubleSide,
    polygonOffset: opts.usePolygonOffset ?? true,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? -1.5,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? -1.5
  });
  material.userData.isTerritoryFillMaterial = true;
  return material;
}

export function isTerritoryFillMaterial(material: THREE.Material | THREE.Material[] | null | undefined): material is THREE.ShaderMaterial {
  return !!material && !Array.isArray(material) && material.userData?.isTerritoryFillMaterial === true;
}

export function getTerritoryMaterialBaseColorHex(material: THREE.ShaderMaterial): number {
  return (material.uniforms.uBaseColor.value as THREE.Color).getHex();
}

export function setTerritoryMaterialBaseColor(material: THREE.ShaderMaterial, hex: number): void {
  (material.uniforms.uBaseColor.value as THREE.Color).setHex(hex);
}

/**
 * For a mesh of many parts: every part in `hex`, or each in its own colour when
 * null. The Quiet style is one colour, Classic each territory's own (territoryStyles.ts).
 */
export function setTerritoryMaterialOneColour(material: THREE.ShaderMaterial, hex: number | null): void {
  if (hex !== null) (material.uniforms.uBaseColor.value as THREE.Color).setHex(hex);
  material.uniforms.uOneColour.value = hex === null ? 0 : 1;
}

export function getTerritoryMaterialOpacity(material: THREE.ShaderMaterial): number {
  return material.uniforms.uOpacity.value as number;
}

export function setTerritoryMaterialOpacity(material: THREE.ShaderMaterial, opacity: number): void {
  material.uniforms.uOpacity.value = opacity;
}

/** How strongly the sun shades the fill, 0–1: 0 is flat, 1 today's (territoryStyles.ts, `shading`). */
export function setTerritoryMaterialShading(material: THREE.ShaderMaterial, shading: number): void {
  material.uniforms.uShading.value = shading;
}

export function setTerritoryMaterialHoverSelectDim(material: THREE.ShaderMaterial, hoverT: number, selectT: number, dimT: number): void {
  material.uniforms.uHoverT.value = hoverT;
  material.uniforms.uSelectT.value = selectT;
  material.uniforms.uDimT.value = dimT;
}

export function setTerritoryMaterialSunDirection(material: THREE.ShaderMaterial, direction: THREE.Vector3): void {
  (material.uniforms.uSunDirection.value as THREE.Vector3).copy(direction).normalize();
}

export function setTerritoryMaterialQaTint(material: THREE.ShaderMaterial, colorHex: number, strength: number): void {
  (material.uniforms.uQaTintColor.value as THREE.Color).setHex(colorHex);
  material.uniforms.uQaTintStrength.value = strength;
}
