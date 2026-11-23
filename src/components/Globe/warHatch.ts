/**
 * The hatching of War & Conflict's outer countries (theatre-lens.md, TL5): the
 * countries on a war's list where it is not fought, hatched in the war's tier
 * colour over their outline, so they read under Classic's four colours where an
 * outline alone did not.
 *
 * Drawn by a shader over the country's fill geometry, which GeometryFactory
 * caches and owns. Its lines rise to the right at 45° on the ground round the
 * country's middle, and stay about HATCH_SPACING_PX apart at any zoom: as the
 * view pulls back, every other line fades out, and as it comes in, they fade back.
 *
 * The screen gives the hatching up first on a weak device, with the glow
 * (globeQuality.ts); every capture draws it.
 */
import * as THREE from 'three';

/** How far apart the lines stand on screen, in pixels, give or take half. */
export const HATCH_SPACING_PX = 8;
/** Under the fills where wars are fought: the outer countries are the lesser fact (TL1). */
export const HATCH_OPACITY = 0.45;
/** Under a featured item or a lens, as the outlines fade (theatre-lens.md, TL1). */
export const FADED_HATCH_OPACITY = 0.15;

const vertexShader = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
// The cosine of the country's middle latitude, and its longitude in radians.
uniform vec2 uRef;
varying vec3 vPos;

const float PI = 3.141592653589793;
const float SPACING_PX = ${HATCH_SPACING_PX.toFixed(1)};
const float HALF_WIDTH_PX = 0.6;

// Lines every 'spacing' along s, as coverage of this pixel; perPx is how far s moves across one pixel.
float lines(float s, float spacing, float perPx) {
  float f = fract(s / spacing);
  float px = min(f, 1.0 - f) * spacing / perPx;
  return 1.0 - smoothstep(HALF_WIDTH_PX - 0.5, HALF_WIDTH_PX + 0.5, px);
}

void main() {
  vec3 d = normalize(vPos);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  // Degrees north less degrees east as the ground measures them at the country's middle:
  // constant along lines rising to the right. Longitude is taken round the middle, so
  // the seam where it wraps is on the far side of the planet.
  float east = mod(lon - uRef.y + PI, 2.0 * PI) - PI;
  float s = degrees(lat - east * uRef.x);
  float perPx = max(fwidth(s), 1e-5);
  // Lines at a power of two degrees apart, the two nearest SPACING_PX blended.
  float level = log2(perPx * SPACING_PX);
  float l0 = floor(level);
  float a = mix(lines(s, exp2(l0), perPx), lines(s, exp2(l0 + 1.0), perPx), level - l0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, uOpacity * a);
  // Out of the working colour space, as the fills' and outlines' own materials are, so the tier colours match.
  #include <colorspace_fragment>
}
`;

/** A country's hatching, in its tier's colour, its lines at 45° round its middle. */
export function hatchMaterial(color: number, opacity: number, middle: { lat: number; lng: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uRef: { value: new THREE.Vector2(Math.cos(THREE.MathUtils.degToRad(middle.lat)), THREE.MathUtils.degToRad(middle.lng)) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    // As the fills stand (GeometryFactory.buildTerritoryPolygons): over the sphere they sit on.
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  });
}
