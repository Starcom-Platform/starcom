// screenPoints.ts — globe markers drawn at a fixed size on screen.
//
// ─── WHY NOT SPHERES ───────────────────────────────────────────────────────
//
// Markers were modelled as spheres in scene units (1 Earth radius = 100 units). A
// sphere shrinks with distance, and at the default share-card view — the camera 2.4
// radii out — the layer audit measured on 2026-09-11:
//
//   Satellites     spheres 0.3 units across came out 2 to 4 px on a 1200-wide card:
//                  11 of 91 marks as large as 4×4 px, median 3 px². An empty sky.
//   Cyber Threats  spheres 0.02 to 0.06 units — sized for a globe of radius 1, on a
//                  globe of radius 100 — came out under half a pixel. The layer drew
//                  nothing a person could see, with 150 indicators loaded.
//
// Both are the misreading the layers' source-health work exists to prevent, with the
// data present. A point with a fixed pixel size reads the same at every zoom: legible
// on a card, not a blot when zoomed in. The globe still occludes the far side (depth
// test on), so nothing behind the Earth shows through.
import * as THREE from 'three';
import { zoomOutFadeFor } from './zoomOutFade';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';

/** The globe's radius in scene units: the icons' height above the ground is measured in these. */
const GLOBE_RADIUS_UNITS = 100;

/**
 * `disc`   a filled disc with a rim — the marker itself.
 * `glow`   a disc with its own light around it — a mark that glows.
 * `ring`   a hollow ring — an accent drawn around a disc.
 * `bloom`  a soft additive brightening, and NOT a mark — see below.
 * `dashedRing`  a ring broken into dashes: the ring of a mark placed less exactly
 *          than the rest, where every mark is already a ring (Diplomacy, D-DP DP13).
 *
 * `glow` and `bloom` were one value called `glow` until 2026-09-18, and the
 * overload cost a day. A bloom is right for a layer drawn BEHIND marks, where
 * adding light means something: useCyberAttacks3D brightens where attacks crowd
 * and where they are new. Drawn AS a mark it measured as very nearly invisible —
 * additive light over an already-bright green and yellow globe barely changes it
 * — so `glow` now draws a core as well, in one object, and `bloom` keeps the
 * pure additive behaviour for the two layers whose meaning it is.
 *
 * Only `disc`, `glow` and `ring` are offered to a person; `bloom` is not a way
 * of drawing a mark, and `dashedRing` is a layer's, not a choice. See markerStyles.ts.
 */
export type ScreenPointStyle = 'disc' | 'glow' | 'ring' | 'bloom' | 'dashedRing';

export interface ScreenPoint {
  position: THREE.Vector3;
  /** On-screen diameter in CSS pixels. */
  sizePx: number;
  color: number;
  /** Its icon's cell in the layer's icon atlas (`ScreenPointsOptions.icons`), drawn close in; absent, a dot always. */
  iconCell?: number;
  /**
   * What a person sees when they hover this mark. Collected into userData.tooltips in
   * point order and read back by useGlobePointTooltips — a mark that says nothing when
   * asked is a mark a reader cannot check.
   */
  tooltip?: string;
  /**
   * The number the mark's size encodes — events, people, addresses — when there is
   * one. Collected into userData.magnitudes like the tooltips, so describeView can
   * rank by the value rather than by pixels: sizes are capped, and at the cap 626
   * events and 142 draw alike.
   */
  magnitude?: number;
  /**
   * What a click on this mark opens (critique C5, decision D-CT, CT3): its notes, beside the hover
   * that names them. Collected into userData.opens in point order, as the tooltips are.
   */
  opens?: GlobeNoteSet;
}

/**
 * Icons close in (critique-2026-11-01, OR30): below `nearAltitude` (Earth radii above the ground) a mark with an
 * `iconCell` is drawn as that cell of the atlas, `sizePx` across; above it, the dot it always was.
 */
export interface ScreenPointIcons {
  atlas: THREE.Texture;
  cellCount: number;
  rowCount: number;
  /** The atlas row the icons are drawn from. */
  row: number;
  sizePx: number;
  nearAltitude: number;
}

export interface ScreenPointsOptions {
  style?: ScreenPointStyle;
  icons?: ScreenPointIcons | null;
  /**
   * Whether marks shrink and fade as the ground under them turns away
   * (decision D-F, clutter and legibility). Default true.
   *
   * An escape hatch, not a decision: a layer whose marks are not on the surface
   * has grounds to opt out, and finding that out should not mean editing the
   * shader ten layers draw through. See LIMB_MIN_SCALE.
   */
  limbFalloff?: boolean;
  /**
   * Anything the layer wants to hang off the object, merged with the tooltips this
   * builder collects. Passed here rather than assigned afterwards because
   * `points.userData = {...}` REPLACES what the builder set: every layer did exactly
   * that, and every tooltip was silently wiped — the marks hovered as though they had
   * none, which is how the picking work looked finished while doing nothing.
   */
  userData?: Record<string, unknown>;
  /**
   * Marks that move between two snapshots on the GPU (D-GV GV2, the satellites): `position` holds the first and
   * `positionNext` the second, and `blend` (setScreenPointsBlend) runs from 0 to 1 between them. A pick reads
   * `position`, a step behind at most.
   */
  blend?: boolean;
  /**
   * Disc rim. A dark rim keeps a bright fill visible over cloud and ice; a light rim
   * keeps a dark fill visible over ocean and the night side.
   */
  rim?: 'dark' | 'light';
  opacity?: number;
}

const RIM = { dark: new THREE.Color(0x05080d), light: new THREE.Color(0xf2f4f7) };

/*
 * Drawn after every surface layer. These markers do not write depth, so one marker does
 * not cut a hole in another — which means anything drawn AFTER them paints over them.
 * The country fills were the case that forced this: transparent, depth-tested, and
 * standing at 1.035 Earth radii, so over land they were in front of every marker below
 * them. They are a decal on the surface now (globeAltitudes.ts), but the ordering rule
 * still holds for anything else drawn over the globe. screenPoints.test.ts reads every
 * render order set in src/ and fails if one comes near this.
 */
export const SCREEN_POINTS_RENDER_ORDER = 200;

/**
 * How much larger a `glow` quad is than the mark inside it.
 *
 * A point sprite's footprint IS its size: nothing can be drawn outside the quad,
 * so light AROUND a mark needs a bigger quad with the mark in the middle of it.
 * The mark keeps the size it asked for — the fragment shader scales the distance
 * back by this figure — and the light falls off to the quad's edge.
 *
 * 2.2 is measured, not picked. useCyberAttacks3D pairs a 2.2x halo at 0.3 opacity
 * BEHIND its indicator discs, which is why that layer's glow reads when a bare
 * additive bloom does not, and the first fix for the invisible glow reused those
 * numbers as a second object drawn behind the mark. That worked, but it lived in
 * useScreenMarkLayer, so the ten layers that call buildScreenPoints directly
 * could not offer a glow at all. Same proven figure, same reason, now in the
 * shader where every caller gets it.
 */
export const GLOW_QUAD_SCALE = 2.2;

/**
 * Put a group of markers after every surface layer in the draw order, and return it.
 *
 * three.js sorts transparent objects by their nearest enclosing Group's renderOrder
 * BEFORE their own — a marker's own order only ranks it among its siblings. Measured
 * 2026-09-11: the country fills sit in a group at 95, the Cyber Threats markers' group
 * was at 0, and every fill painted over every marker beneath it, whatever order the
 * markers themselves had. Only the markers over open sea showed.
 */
export function drawAboveSurfaceLayers<T extends THREE.Object3D>(group: T): T {
  group.renderOrder = SCREEN_POINTS_RENDER_ORDER;
  return group;
}

/**
 * A mark's on-screen diameter in CSS pixels, for a mark that stands for `count` things.
 *
 * A capped log scale. Counts of this kind are heavy-tailed — one country with fifty
 * events beside thirty with one or two — so a linear scale draws either invisible dots
 * or blots. The floor is what a card can show: the layer audit counts a mark legible at
 * 4×4 px, and a card draws the canvas at about 0.87 of its size at the default view.
 */
export function markPxForCount(count: number, floorPx = 8, capPx = 20): number {
  const n = Math.max(1, Number.isFinite(count) ? count : 1);
  return Math.min(floorPx + 2 * Math.log2(n), capPx);
}

/**
 * How a mark behaves as the surface under it turns away from the camera
 * (decision D-F, clutter and legibility).
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * A screen point is drawn at a fixed pixel size wherever it sits, so a mark at
 * the limb — where the ground it describes is nearly edge-on — was drawn at
 * exactly the size it has dead centre. The layer audit first read this as marks
 * rendering OUTSIDE the globe. Zoomed in they sit ON the limb, full size,
 * against the dark terminator, which reads as a halo at contact-sheet scale.
 * RLSH mode showed it plainest: 44 marks stacked down the left edge, not one of
 * them foreshortened.
 *
 * ─── THE NUMBERS ───────────────────────────────────────────────────────────
 *
 * `facing` is how squarely the ground faces the camera: 1 dead centre, 0
 * exactly on the limb, negative behind it. Exported because the shader reads
 * these very constants — a second copy written into the GLSL would be free to
 * drift from the documented ones.
 */
/** How small a mark gets when its ground is edge-on. Not zero: a mark that vanishes cannot be disbelieved. */
export const LIMB_MIN_SCALE = 0.55;
/** Above this, full size — most of the disc is unaffected. */
export const LIMB_SQUARE_ON = 0.35;
/** Fully drawn at and above this. */
export const LIMB_FADE_IN = 0.12;
/** Gone by here, just past the horizon. */
export const LIMB_FADE_OUT = -0.05;

const VERTEX = /* glsl */ `
  attribute float pointSize;
  attribute vec3 pointColor;
  uniform float pixelRatio;
  uniform float limbFalloff;
  varying vec3 vColor;
  varying float vFacing;
  #if defined(BLEND_POSITIONS)
  // Two snapshots a step apart, blended each frame: a mark moves smoothly with its positions uploaded once a step.
  attribute vec3 positionNext;
  uniform float blend;
  #endif
  #if defined(USE_ICONS)
  // A mark's icon, close in (critique-2026-11-01, OR30): its atlas cell, or -1 for a dot at every height.
  attribute float iconCell;
  uniform float iconNear;
  uniform float iconSize;
  varying float vIconCell;
  #endif
  void main() {
    vColor = pointColor;
  #if defined(BLEND_POSITIONS)
    vec4 world = modelMatrix * vec4(mix(position, positionNext, blend), 1.0);
  #else
    vec4 world = modelMatrix * vec4(position, 1.0);
  #endif
    gl_Position = projectionMatrix * viewMatrix * world;

    /*
     * The surface normal under this mark, derived rather than supplied: every
     * screen point sits on a radius of a sphere centred on its group's origin,
     * so the normal is the direction from that centre to the point. Taking the
     * centre through modelMatrix keeps it right when the group is moved.
     *
     * That is what lets ten calling layers stay untouched.
     */
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 surfaceNormal = normalize(world.xyz - centre);
    float facing = dot(surfaceNormal, normalize(cameraPosition - world.xyz));
    vFacing = facing;

    float foreshorten = mix(${LIMB_MIN_SCALE}, 1.0, smoothstep(0.0, ${LIMB_SQUARE_ON}, facing));
    float quad = 1.0;
  #if defined(STYLE_GLOW)
    // Room for the light around the mark. The mark itself stays the size it
    // asked for; the fragment shader scales the distance back.
    quad = ${GLOW_QUAD_SCALE};
  #endif
    float size = pointSize;
  #if defined(USE_ICONS)
    vIconCell = iconCell;
    if (iconCell > -0.5) size = mix(pointSize, iconSize, iconNear);
  #endif
    gl_PointSize = size * pixelRatio * quad * mix(1.0, foreshorten, limbFalloff);
  }
`;

// No texture to load: each style is a function of the distance from the point's centre.
const FRAGMENT = /* glsl */ `
  uniform vec3 rimColor;
  uniform float opacity;
  uniform float limbFalloff;
  uniform float zoomFade;
  varying vec3 vColor;
  varying float vFacing;
  #if defined(USE_ICONS)
  uniform sampler2D iconAtlas;
  uniform float iconCells;
  uniform float iconRows;
  uniform float iconRow;
  uniform float iconNear;
  varying float vIconCell;
  #endif
  void main() {
  #if defined(USE_ICONS)
    // Close in, a mark with a cell is its icon, drawn from the atlas as the glyph sprites draw theirs.
    if (vIconCell > -0.5 && iconNear > 0.5) {
      vec2 uv = vec2((vIconCell + gl_PointCoord.x) / iconCells, (iconRow + gl_PointCoord.y) / iconRows);
      vec4 texel = texture2D(iconAtlas, uv);
      if (texel.a < 0.04) discard;
      float iconFade = mix(1.0, smoothstep(${LIMB_FADE_OUT}, ${LIMB_FADE_IN}, vFacing), limbFalloff) * zoomFade;
      gl_FragColor = sRGBTransferOETF(vec4(texel.rgb, texel.a * opacity * iconFade));
    #if defined(STYLE_GLOW)
      // The glow's material blends premultiplied: an icon is composited like its disc.
      gl_FragColor.rgb *= gl_FragColor.a;
    #endif
      return;
    }
  #endif
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // Light a style wants ADDED rather than composited. Only STYLE_GLOW fills it
    // in; see the premultiplied tail below for what it does and why.
    float addLight = 0.0;
  #if defined(STYLE_BLOOM)
    // Additive, and nothing else: brightening is the whole point. See
    // ScreenPointStyle for why this is not a way of drawing a mark.
    gl_FragColor = vec4(vColor, opacity * exp(-d * d * 18.0));
  #elif defined(STYLE_GLOW)
    /*
     * A mark that glows: the rimmed disc STYLE_DISC draws, with its own light
     * falling off around it, in ONE object.
     *
     * r is the distance in the MARK's coordinates — the quad is
     * GLOW_QUAD_SCALE larger, so r = 0.5 is the mark's own edge and the rest of
     * the quad is room for the light. That keeps the disc here identical in size
     * to the one STYLE_DISC draws: switching a layer from disc to glow adds a
     * halo, it does not resize the marks.
     *
     * One material has one blend mode, and this one is normal, so the halo
     * lightens toward the fill colour rather than adding to whatever is behind
     * it. It reads as lit; it does not brighten a crowd. STYLE_BLOOM is still
     * what brightens a crowd.
     */
    float r = d * ${GLOW_QUAD_SCALE};
    float core = smoothstep(0.33, 0.30, r);
    float discMask = smoothstep(0.5, 0.42, r);
    // Fill inside the core, rim in the band outside it. Clamped because a dark
    // rim colour otherwise bled outward into the light.
    vec3 lit = mix(vColor, rimColor, clamp(discMask - core, 0.0, 1.0));
    // The disc composites; the halo OUTSIDE it is light, so it never covers the
    // disc's own rim and never rides along in the alpha.
    addLight = exp(-d * d * 9.0) * (1.0 - discMask) * 0.55;
    gl_FragColor = vec4(lit, opacity * discMask);
  #elif defined(STYLE_RING)
    gl_FragColor = vec4(vColor, opacity * smoothstep(0.30, 0.36, d) * smoothstep(0.5, 0.44, d));
  #elif defined(STYLE_DASHED_RING)
    // The ring above, broken into eight dashes: dashed means "not exact" in this app.
    vec2 p = gl_PointCoord - 0.5;
    float dash = smoothstep(-0.2, 0.2, sin(atan(p.y, p.x) * 8.0));
    gl_FragColor = vec4(vColor, opacity * dash * smoothstep(0.30, 0.36, d) * smoothstep(0.5, 0.44, d));
  #else
    vec3 rgb = d < 0.33 ? vColor : rimColor;
    gl_FragColor = vec4(rgb, opacity * smoothstep(0.5, 0.42, d));
  #endif
    /*
     * Three.js reads a colour given as hex as sRGB and hands the shader a LINEAR
     * value; a raw ShaderMaterial that writes it out unconverted displays it darker
     * than the colour asked for.
     *
     * The transfer functions are already in the prefix three.js prepends to every
     * fragment shader, so they are called directly: adding
     * <colorspace_pars_fragment> to get them redefines them ("function already has a
     * body"), the shader then fails to compile, and a material that fails to compile
     * draws nothing at all — that took every country fill and every marker off the
     * globe until the console said why.
     */
    /*
     * Fade out as the ground turns away, after the style has chosen its alpha so
     * every style fades the same way. Applied before the transfer function
     * because it is an alpha, which that function leaves alone.
     */
    // And as the Earth shrinks on screen, so its marks never outgrow it (zoomOutFade.ts).
    float fade = mix(1.0, smoothstep(${LIMB_FADE_OUT}, ${LIMB_FADE_IN}, vFacing), limbFalloff) * zoomFade;
    gl_FragColor.a *= fade;
    gl_FragColor = sRGBTransferOETF( gl_FragColor );
  #if defined(STYLE_GLOW)
    /*
     * PREMULTIPLIED OUTPUT, which is what makes a halo light rather than paint.
     *
     * The material sets premultipliedAlpha, so the blend is
     * src + dst*(1 - src.a). Writing the disc's colour times its own coverage
     * with that coverage as alpha is ordinary compositing; writing colour with
     * alpha ZERO leaves dst untouched and ADDS — one material, two behaviours.
     *
     * Why it has to be additive is arithmetic, not taste: compositing a colour
     * over a background at alpha a gives mix(bg, mark, a), which is DARKER than
     * the background wherever the mark is darker than the ground beneath it. A
     * halo that darkens the ground around every mark is not a glow, and some of
     * every palette is darker than some of the Earth. screenPoints.test.ts pins
     * that arithmetic; adding light cannot darken anything.
     *
     * Measured on the running build 2026-09-18, space weather at lat 20 / lng 5
     * / alt 2.4 under SwiftShader, one load with the style switched on screen and
     * each style captured twice: against the disc it replaces, a glow brightens
     * 897 px and darkens 13, where two captures of the SAME style differ by about
     * 2,700. (An earlier before/after here claimed 11,365 brighter and 55,854
     * darker. That was measured one load per style, and a load whose base texture
     * timed out — which is most of them under SwiftShader — differs from one that
     * did not across a twentieth of the frame. The signature followed the failed
     * load to a different style when the probe was repeated, so the number was
     * drift, and it is recorded here only because it was nearly believed.)
     */
    vec3 light = sRGBTransferOETF( vec4(vColor, 1.0) ).rgb * (addLight * opacity * fade);
    gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a + light, gl_FragColor.a);
  #endif
  }
`;

/**
 * One draw call for a whole set of markers. The pixel ratio is read from the renderer
 * on every draw, so a marker is the same size in CSS pixels on every screen — and in a
 * capture rendered at another resolution.
 */
/**
 * What a style sets on the material — and nothing a style sets lives anywhere
 * else. One function, used both to build marks and to restyle them, so the two
 * cannot disagree: screenPoints.test.ts checks that a set built as discs and
 * restyled draws exactly like a set built in that style.
 */
function stylePropsFor(style: ScreenPointStyle): Pick<THREE.ShaderMaterial, 'defines' | 'blending' | 'premultipliedAlpha'> {
  return {
    defines: style === 'glow' ? { STYLE_GLOW: '' }
      : style === 'ring' ? { STYLE_RING: '' }
      : style === 'bloom' ? { STYLE_BLOOM: '' }
      : style === 'dashedRing' ? { STYLE_DASHED_RING: '' }
      : {},
    blending: style === 'bloom' ? THREE.AdditiveBlending : THREE.NormalBlending,
    /*
     * Only the glow, and only because its shader writes premultiplied values.
     * three.js turns this into src + dst*(1 - src.a), which lets one material
     * composite the disc and add the halo as light. Setting it on a style whose
     * shader writes straight alpha would wash that style out.
     */
    premultipliedAlpha: style === 'glow',
  };
}

export function buildScreenPoints(points: readonly ScreenPoint[], options: ScreenPointsOptions = {}): THREE.Points {
  const { style = 'disc', rim = 'dark', opacity = 1, limbFalloff = true, blend = false, icons = null } = options;
  const n = points.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const c = new THREE.Color();
  points.forEach((p, i) => {
    positions.set([p.position.x, p.position.y, p.position.z], i * 3);
    c.setHex(p.color);
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = p.sizePx;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('pointColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('pointSize', new THREE.BufferAttribute(sizes, 1));
  if (blend) geometry.setAttribute('positionNext', new THREE.BufferAttribute(positions.slice(), 3));
  if (icons) geometry.setAttribute('iconCell', new THREE.BufferAttribute(Float32Array.from(points, (p) => (typeof p.iconCell === 'number' && p.iconCell >= 0 ? p.iconCell : -1)), 1));
  const styled = stylePropsFor(style);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      pixelRatio: { value: 1 },
      rimColor: { value: RIM[rim].clone() },
      opacity: { value: opacity },
      limbFalloff: { value: limbFalloff ? 1 : 0 },
      zoomFade: { value: 1 },
      ...(blend ? { blend: { value: 0 } } : {}),
      ...(icons ? {
        iconAtlas: { value: icons.atlas }, iconCells: { value: icons.cellCount }, iconRows: { value: icons.rowCount },
        iconRow: { value: icons.row }, iconSize: { value: icons.sizePx }, iconNear: { value: 0 },
      } : {}),
    },
    ...styled,
    defines: { ...styled.defines, ...(blend ? { BLEND_POSITIONS: '' } : {}), ...(icons ? { USE_ICONS: '' } : {}) },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  // So a fade can find the uniform — see isScreenPointsMaterial.
  material.userData.screenPoints = true;
  const object = new THREE.Points(geometry, material);
  object.userData = {
    ...options.userData,
    ...(points.some((p) => p.tooltip) ? { tooltips: points.map((p) => p.tooltip ?? '') } : {}),
    // In point order, as the tooltips: what a click on each opens (useGlobePointTooltips).
    ...(points.some((p) => p.opens) ? { opens: points.map((p) => p.opens ?? null) } : {}),
    ...(points.some((p) => typeof p.magnitude === 'number')
      ? { magnitudes: points.map((p) => (typeof p.magnitude === 'number' ? p.magnitude : null)) } : {}),
  };
  const centre = new THREE.Vector3();
  object.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    material.uniforms.zoomFade.value = zoomOutFadeFor(renderer, camera, object);
    if (icons) {
      // Close in or not: the camera's height above the ground, in Earth radii (the group's centre is the Earth's).
      object.getWorldPosition(centre);
      const altitude = camera.position.distanceTo(centre) / GLOBE_RADIUS_UNITS - 1;
      material.uniforms.iconNear.value = altitude < icons.nearAltitude ? 1 : 0;
    }
  };
  // Positions can move after the bounding sphere is computed (satellites do, every
  // second); a stale one would cull markers that are on screen.
  object.frustumCulled = false;
  object.renderOrder = SCREEN_POINTS_RENDER_ORDER;
  return object;
}

/**
 * Redraw marks already on the globe in another style, in place (decision D-F,
 * step 6.3).
 *
 * A style lives in the material and nowhere in the geometry, so only the
 * material changes: positions, colours, sizes and tooltips stay exactly as they
 * were, and so do the opacity and rim uniforms — a fade in progress survives.
 *
 * Every layer used to restyle by rebuilding, which is where Satellites went
 * wrong: its rebuild lived in the effect that loads the catalogue, so choosing
 * a style reloaded the data. With this a layer can hold its marks and change
 * how they look without going near what they were drawn from.
 */
export function setScreenPointsStyle(points: THREE.Points, style: ScreenPointStyle): void {
  const material = points.material as THREE.ShaderMaterial;
  const blending = material.defines !== undefined && 'BLEND_POSITIONS' in material.defines;
  const icons = material.defines !== undefined && 'USE_ICONS' in material.defines;
  const styled = stylePropsFor(style);
  // A restyle keeps the marks moving and their icons: the blend and the icons are the geometry's, not the style's.
  Object.assign(material, styled, { defines: { ...styled.defines, ...(blending ? { BLEND_POSITIONS: '' } : {}), ...(icons ? { USE_ICONS: '' } : {}) } });
  // New defines mean a new program, and three.js compiles one only when told.
  material.needsUpdate = true;
}

/** Both snapshots of moving marks (`blend`), x, y, z each, uploaded at once; the blend starts again from the first. */
export function setScreenPointsSnapshots(points: THREE.Points, from: ArrayLike<number>, to: ArrayLike<number>): void {
  const a = points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const b = points.geometry.getAttribute('positionNext') as THREE.BufferAttribute | undefined;
  (a.array as Float32Array).set(from);
  a.needsUpdate = true;
  if (b) {
    (b.array as Float32Array).set(to);
    b.needsUpdate = true;
  }
  setScreenPointsBlend(points, 0);
}

/** How far moving marks are from their first snapshot to their second, 0 to 1. */
export function setScreenPointsBlend(points: THREE.Points, t: number): void {
  const uniform = (points.material as THREE.ShaderMaterial).uniforms.blend;
  if (uniform) uniform.value = Math.min(1, Math.max(0, t));
}

/** Move point `i`. The caller marks the position attribute for upload once per batch. */
export function setScreenPointPosition(points: THREE.Points, i: number, position: THREE.Vector3): void {
  (points.geometry.getAttribute('position') as THREE.BufferAttribute).setXYZ(i, position.x, position.y, position.z);
}

export function setScreenPointsOpacity(points: THREE.Points, opacity: number): void {
  setScreenPointsMaterialOpacity(points.material as THREE.Material, opacity);
}

/**
 * A screen-points material, told apart from every other material in a scene.
 *
 * Needed because opacity here is a UNIFORM, while `Material.opacity` also exists on
 * a ShaderMaterial and is simply ignored by this shader. Anything fading a group by
 * writing `.opacity` therefore ran, changed nothing, and reported success — see
 * geopolitical/utils/groupFade.ts, which has the same special case for the country
 * fills' own uniform-driven material.
 */
export function isScreenPointsMaterial(material: THREE.Material): boolean {
  return material.userData?.screenPoints === true;
}

export function getScreenPointsMaterialOpacity(material: THREE.Material): number {
  return (material as THREE.ShaderMaterial).uniforms.opacity.value as number;
}

export function setScreenPointsMaterialOpacity(material: THREE.Material, opacity: number): void {
  (material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
}

/**
 * How many marks a set holds.
 *
 * Named because the obvious `.count` is an InstancedMesh property: on a THREE.Points
 * it is undefined, so `mesh?.count ?? 0` reads zero and a debug hook or probe reports
 * "nothing drawn" over a globe covered in marks.
 */
export function screenPointCount(points: THREE.Points | null | undefined): number {
  return points ? points.geometry.getAttribute('position').count : 0;
}

/** Release a set's GPU buffers. */
export function disposeScreenPoints(points: THREE.Points): void {
  points.geometry.dispose();
  (points.material as THREE.Material).dispose();
}
