/**
 * Turning a stored outline into something the geometry factory can draw.
 *
 * The coordinate order is the whole risk here. The outline stores [lat, lon]
 * because that is how the rest of the intel model reads; the factory takes
 * [lng, lat]. Getting it backwards does not crash — it draws the district in
 * the sea, several thousand kilometres from the pin that is also drawn for the
 * same report.
 */
import { describe, it, expect } from 'vitest';
import { outlineLineFeatures, outlineSimplification } from '../outlineFeatures';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import type { BoundedOutline } from '../../../geoint/boundedOutline';

const marker = (outline?: BoundedOutline): IntelReportOverlayMarker => ({
  pubkey: 'r1', title: 't', content: '', tags: [],
  latitude: 38.9, longitude: -77.03, timestamp: 0, author: 'a',
  ...(outline ? { outline } : {}),
} as IntelReportOverlayMarker);

const polygon = (parts: Array<Array<[number, number]>>, kept = 4, source = 4): BoundedOutline => ({
  kind: 'polygon', parts, sourceVertices: source, keptVertices: kept,
});

describe('outlineLineFeatures', () => {
  it('flips [lat, lon] into the [lng, lat] the factory expects', () => {
    const features = outlineLineFeatures([
      marker(polygon([[[38.9, -77.03], [38.8, -77.02], [38.85, -77.1]]])),
    ]);
    // Longitude first. Reversed, this point lands at 38.9E/-77.03 — in the
    // Indian Ocean rather than Washington.
    expect(features[0].coordinates[0]).toEqual([-77.03, 38.9]);
  });

  it('closes a ring so a polygon does not draw as an open arc', () => {
    const features = outlineLineFeatures([
      marker(polygon([[[38.9, -77.03], [38.8, -77.02], [38.85, -77.1]]])),
    ]);
    const coords = features[0].coordinates;
    expect(coords).toHaveLength(4);
    expect(coords[coords.length - 1]).toEqual(coords[0]);
  });

  it('leaves an already-closed ring alone', () => {
    const features = outlineLineFeatures([
      marker(polygon([[[38.9, -77.03], [38.8, -77.02], [38.85, -77.1], [38.9, -77.03]]])),
    ]);
    expect(features[0].coordinates).toHaveLength(4);
  });

  it('does not close a line, which is not a ring', () => {
    const features = outlineLineFeatures([
      marker({ kind: 'line', parts: [[[38.9, -77.03], [38.8, -77.02], [38.7, -77.0]]], sourceVertices: 3, keptVertices: 3 }),
    ]);
    expect(features[0].coordinates).toHaveLength(3);
  });

  it('keeps each ring separate, so a hole is its own boundary', () => {
    // Joined into one feature, the line would run from the outer ring across
    // the middle of the shape to the hole.
    const features = outlineLineFeatures([
      marker(polygon([
        [[38.9, -77.03], [38.8, -77.02], [38.85, -77.1]],
        [[38.87, -77.05], [38.86, -77.04], [38.865, -77.06]],
      ])),
    ]);
    expect(features).toHaveLength(2);
    expect(features[0].id).toBe('r1#0');
    expect(features[1].id).toBe('r1#1');
  });

  it('ignores a marker with no outline, and a part with no length', () => {
    expect(outlineLineFeatures([marker()])).toHaveLength(0);
    expect(outlineLineFeatures([marker(polygon([[[38.9, -77.03]]]))])).toHaveLength(0);
  });
});

describe('outlineSimplification', () => {
  it('counts what is drawn and how much of it is simplified', () => {
    const result = outlineSimplification([
      marker(polygon([[[1, 2], [3, 4]]], 64, 900)),
      marker(polygon([[[1, 2], [3, 4]]], 12, 12)),
      marker(),
    ]);
    expect(result).toEqual({ drawn: 2, simplified: 1 });
  });
});
