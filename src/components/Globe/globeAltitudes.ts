// globeAltitudes.ts — how high each thing sits above the globe, in Earth radii.
//
// ─── WHY THIS IS ONE LIST ──────────────────────────────────────────────────
//
// The country fills stood at 1.035 — 223 km up, above the clouds, above every
// marker any layer drew. Measured 2026-09-11: they cover about a tenth of the
// frame, and because they are depth-TESTED they sit in front of everything
// below them, so the Space Weather, Earth Weather and Eco Disasters layers each
// loaded their data, drew hundreds of objects, and showed a person nothing.
//
// Two different mechanisms decide whether a mark survives, which is why the
// heights alone were never enough:
//
//   · a transparent mark that does not write depth is covered by whatever is
//     drawn AFTER it — that is draw order, and screenPoints.ts's
//     drawAboveSurfaceLayers handles it;
//   · an opaque mark, or any mark that writes depth, is drawn in the opaque
//     pass BEFORE every transparent object, so a transparent shell in front of
//     it paints over it whatever the order — only height saves it.
//
// So the base map goes to the bottom of the stack, just off the surface, and
// these are the bands everything else uses. Keep them in this order.
//
// 1 Earth radius = 100 scene units (GLOBE_RADIUS_UNITS).

/**
 * Weather fields that recolour the planet itself: the temperature heat map
 * (decision D-W, WX1). The one band below the base map, because it is the
 * ground's own colour, not something drawn on the ground: country fills and
 * borders a person turns on read over it, never under it. It writes no depth
 * and draws first among the see-through layers.
 */
export const WEATHER_FIELDS = 1.001;
/** The country fills and anything else that reads as painted on the ground. */
export const BASE_MAP = 1.002;
/**
 * The wind's streaks (decision D-W, WX3): over the ground and the fills,
 * under the clouds, as a weather map draws wind under its cloud.
 */
export const WIND_FLOW = 1.003;
/** three-globe's cloud shell (useGlobeCloudLayer's CLOUDS_ALTITUDE). Not ours to move. */
export const CLOUDS = 1.004;
/** Lines that follow the surface: submarine cables, trade routes. */
export const SURFACE_LINES = 1.006;
/** Points of their own place: landing points, gauges, volcanoes, weather stations. */
export const SURFACE_MARKS = 1.010;
/** Marks that stand for a whole country, not a point in it. */
export const COUNTRY_MARKS = 1.020;
/** Accents drawn around another mark — rings, halos. */
export const MARK_ACCENTS = 1.025;
/**
 * The Intel Report glyphs (decision D-F, step 6, part 4).
 *
 * Its own band, above every surface mark and accent, so a glyph on its backing
 * is never cut by a border line or a ring beneath it. A report once drew twice —
 * a dot on the ground at SURFACE_MARKS and the glyph standing above it — and
 * since section 18 the glyph alone marks the place; the dot is drawn only when
 * the glyphs cannot be.
 */
export const REPORT_SPRITES = 1.030;

/** Every band, lowest first — what the test checks, and a reader's summary. */
export const ALTITUDE_BANDS = [
  ['WEATHER_FIELDS', WEATHER_FIELDS],
  ['BASE_MAP', BASE_MAP],
  ['WIND_FLOW', WIND_FLOW],
  ['CLOUDS', CLOUDS],
  ['SURFACE_LINES', SURFACE_LINES],
  ['SURFACE_MARKS', SURFACE_MARKS],
  ['COUNTRY_MARKS', COUNTRY_MARKS],
  ['MARK_ACCENTS', MARK_ACCENTS],
  ['REPORT_SPRITES', REPORT_SPRITES],
] as const;

/*
 * ─── THE CAMERA'S NEAR PLANE ───────────────────────────────────────────────
 *
 * These bands are fractions of a unit apart, so whether the depth buffer can tell them
 * apart decides whether a depth-tested layer z-fights. globe.gl sets the near plane to
 * 0.05, which leaves the base map's 0.2-unit gap above the surface under three depth
 * steps at the default view. At 1 it is about 54 there, and still about 9 at altitude 6.
 * The country fills are depth-tested on that basis (territoryFillMaterial.ts).
 *
 * The cost is how close the camera may come. The orbit controls' minimum distance is
 * raised with it (useGlobeCameraNear) to 1.1 units off the surface, globe.gl's own rule.
 * Globe.tsx's zoom already stops at half an Earth radius (MIN_ALTITUDE).
 *
 * Farther out, the near plane moves with the camera: a thousandth of its distance from
 * the Earth's centre, never less than CAMERA_NEAR, so within 1,000 units, every view a
 * person works in and every card, it is CAMERA_NEAR exactly. Out among the planets a
 * near plane of 1 would leave the depth buffer some 60,000 units coarse a million units
 * away; a thousandth of the distance keeps it near 200 at the far side of the solar
 * system seen from the farthest reach, where Jupiter alone is 2,200 across.
 */
export const CAMERA_NEAR = 1;
const NEAR_PER_DISTANCE = 0.001;

/** The near plane for a camera `distance` scene units from the Earth's centre. */
export function cameraNearAt(distance: number): number {
  return Math.max(CAMERA_NEAR, distance * NEAR_PER_DISTANCE);
}

/*
 * ─── THE CAMERA'S REACH ────────────────────────────────────────────────────
 *
 * The solar system is drawn at true sizes, at one scale about the Earth (decision K6, SS1
 * as amended for C32, docs/missions/01-architecture-decisions/solar-system.md): the Sun
 * about 119,000 units out, Neptune never farther than about 3.73 million (31.3 AU). All of
 * it lies within SOLAR_SYSTEM_EXTENT of the Earth. The camera may back out to CAMERA_REACH,
 * where that much fits inside the default 50° view with more than a tenth to spare,
 * and the far plane reaches the far side of the system from there. globe.gl stopped
 * the camera at 10,000, a hundred Earth radii, and drew nothing past 125,000, short
 * of the Sun.
 */
export const SOLAR_SYSTEM_EXTENT = 3_800_000;
export const CAMERA_REACH = 9_000_000;
export const CAMERA_FAR = CAMERA_REACH + SOLAR_SYSTEM_EXTENT;

/** The smallest depth difference a 24-bit depth buffer resolves at `distance` scene units. */
export function depthStepAt(distance: number, near: number = CAMERA_NEAR, far: number = CAMERA_FAR): number {
  return (distance ** 2 * (1 / near - 1 / far)) / 2 ** 24;
}
