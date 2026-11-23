/**
 * Report outlines, as the line features the geometry factory draws.
 *
 * ─── WHY LINES AND NOT FILLS ───────────────────────────────────────────────
 *
 * `GeometryFactory` offers both, and a filled polygon is the more obvious
 * reading of "draw the area". A stroke is the honest one. What is stored is a
 * bounded outline — at most 64 vertices of a shape that may have had 2000 —
 * and a filled region asserts an interior this node never received. A boundary
 * says what it is: the edge, as far as it was kept.
 *
 * ─── WHY IT GOES THROUGH THE FACTORY ───────────────────────────────────────
 *
 * The factory already corrects winding order, handles holes, splits at the
 * dateline and triangulates, and every geometry layer in this build uses it
 * through its own THREE.Group rather than react-globe.gl's native props (see
 * useGlobeGdacsGeometry). Dateline splitting is the one that matters most
 * here: a shape crossing the antimeridian is exactly the case
 * representativePoint already refuses to take a centroid of, and a line drawn
 * naively across it wraps the wrong way round the planet.
 */
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import type { LineFeature } from '../../../geopolitical/geometry/geometryFactory';

/** A ring is closed for drawing; a line is left open, because it is not a ring. */
const closeIfRing = (
  part: Array<[number, number]>,
  kind: 'line' | 'polygon',
): Array<[number, number]> => {
  if (kind !== 'polygon' || part.length < 3) return part;
  const [firstLng, firstLat] = part[0];
  const [lastLng, lastLat] = part[part.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return part;
  return [...part, part[0]];
};

/**
 * One feature per part: a polygon's rings stay separate so a hole is drawn as
 * its own boundary rather than joined to the outer ring by a line across the
 * middle of the shape.
 */
export function outlineLineFeatures(
  markers: readonly IntelReportOverlayMarker[],
): LineFeature[] {
  const features: LineFeature[] = [];

  for (const marker of markers) {
    const outline = marker.outline;
    if (!outline) continue;

    outline.parts.forEach((part, index) => {
      if (part.length < 2) return;
      // Stored as [lat, lon]; the factory takes [lng, lat]. Getting this
      // backwards puts a district in the sea, so it is done in one place.
      const coordinates = part.map(([lat, lon]) => [lon, lat] as [number, number]);
      features.push({
        id: `${marker.pubkey}#${index}`,
        coordinates: closeIfRing(coordinates, outline.kind),
      });
    });
  }

  return features;
}

/** How much shape detail is being shown, for a surface that has to say so. */
export function outlineSimplification(
  markers: readonly IntelReportOverlayMarker[],
): { drawn: number; simplified: number } {
  let drawn = 0;
  let simplified = 0;
  for (const marker of markers) {
    if (!marker.outline) continue;
    drawn += 1;
    if (marker.outline.keptVertices < marker.outline.sourceVertices) simplified += 1;
  }
  return { drawn, simplified };
}
