/**
 * Whether a captured frame is actually of the view the audit asked for.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The audit compares a layer's frame against the mode's floor frame, so the two
 * have to be photographs of the same thing. On 2026-09-17 they were not, and the
 * numbers it produced were read as layer content for a whole afternoon:
 *
 *   IntelReports.atlantic   39.95°N 88.97°W  alt 1.80R
 *   CyberThreats.atlantic   20.00°N  5.00°E  alt 2.40R
 *
 * The configured `atlantic` view is lat 20, lng 5, alt 2.4 — which Cyber Threats
 * matches and Intel Reports does not. The cause is in the app, doing exactly what
 * it should: `useTurnToFirstIntel` turns the globe to the centroid of the first
 * reports and zooms in. That only happens in IntelReports mode, and IntelReports
 * is the CyberCommand floor.
 *
 * The harness invited it. For the FIRST view only it called setView and then
 * waited SETTLE_MS for the layer's data before capturing — and the turn fires
 * during that wait. Later views wait 2.5s, and the turn has already fired once,
 * so they hold. That is why every CyberCommand layer reported ~170 marks at
 * 3 px² at atlantic and a quarter of the pixels moved: not marks, a moved camera.
 *
 * So the view is re-asserted immediately before each capture, and then CHECKED.
 * A silent camera difference is what produced those numbers, and a measurement
 * that cannot be shown to be of the right view is not reported as one.
 */

/**
 * How far a captured view may sit from the requested one and still be compared.
 *
 * Tight: the globe's own easing settles to the requested position exactly, so
 * anything past rounding means something else moved it. Degrees and Earth radii.
 */
export const VIEW_TOLERANCE = { degrees: 0.5, altitude: 0.05 };

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * How far the captured view sits from the requested one, or null if that cannot
 * be told — a missing reading is not a zero drift.
 */
export function viewDrift(requested, actual) {
  if (!requested || !actual) return null;
  const fields = ['lat', 'lng', 'altitude'];
  if (!fields.every((f) => finite(requested[f]) && finite(actual[f]))) return null;
  return {
    lat: Math.abs(actual.lat - requested.lat),
    lng: Math.abs(actual.lng - requested.lng),
    altitude: Math.abs(actual.altitude - requested.altitude),
  };
}

/**
 * Did the camera stay where the audit put it?
 *
 * False when it cannot be told, deliberately: the whole point is that a frame
 * whose view is unknown must not be compared as though it were known.
 */
export function viewHeld(requested, actual, tolerance = VIEW_TOLERANCE) {
  const drift = viewDrift(requested, actual);
  if (!drift) return false;
  return drift.lat <= tolerance.degrees
    && drift.lng <= tolerance.degrees
    && drift.altitude <= tolerance.altitude;
}

/** One line naming both views, for a reader who has to know why a view was dropped. */
export function describeViewDrift(requested, actual) {
  const place = (v) => (v && finite(v.lat) && finite(v.lng) && finite(v.altitude)
    ? `${v.lat.toFixed(2)}°, ${v.lng.toFixed(2)}° alt ${v.altitude.toFixed(2)}R`
    : 'unknown');
  return `asked for ${place(requested)}, captured ${place(actual)}`;
}
