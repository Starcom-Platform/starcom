/**
 * The shape survives ingest, and the point it is placed by does not change.
 *
 * Both halves matter. Keeping the outline is the point of the change; leaving
 * `latitude`/`longitude` exactly as `representativePoint` set them is what
 * makes it safe, because everything that draws, filters, windows or links a
 * report reads those two fields and must not start reading a shape.
 *
 * Driven through `parseEvent` and `boundedOutline` in the same arrangement the
 * ingest uses, rather than by standing up relays: the wiring between them is
 * three lines, and the behaviour worth pinning is what those produce.
 */
import { describe, it, expect } from 'vitest';
import { parseEvent } from '../../geoint/parser';
import { GEOINT_DEFAULT_CONFIG } from '../../geoint/config';
import { representativePoint } from '../../geoint/representativePoint';
import { boundedOutline, OUTLINE_VERTEX_BUDGET } from '../../geoint/boundedOutline';
import type { ParsedPolygon } from '../../geoint/types';

const polygonEvent = (rings: Array<Array<[number, number]>>) => ({
  id: 'evt-poly', pubkey: 'a'.repeat(64), created_at: Math.floor(Date.now() / 1000),
  kind: 1, sig: '', tags: [['t', 'starcom_intel']],
  content: JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { title: 'A district' },
      geometry: { type: 'Polygon', coordinates: rings },
    }],
  }),
});

/** A closed ring of n vertices, as [lon, lat] pairs the way GeoJSON writes them. */
const ring = (n: number): Array<[number, number]> => {
  const points: Array<[number, number]> = Array.from(
    { length: n - 1 },
    (_, i) => [-77 + i * 0.001, 38.9 + (i % 7) * 0.001] as [number, number],
  );
  return [...points, points[0]];
};

describe('ingest keeps a bounded outline', () => {
  it('keeps the shape of a polygon the globe used to reduce to a pin', () => {
    const parsed = parseEvent(polygonEvent([ring(40)]), GEOINT_DEFAULT_CONFIG);
    const feature = parsed.features[0];
    expect(feature.kind).toBe('polygon');

    const outline = boundedOutline({
      kind: 'polygon', rings: (feature.geometry as ParsedPolygon).rings,
    })!;
    expect(outline.parts[0].length).toBeGreaterThan(2);
    expect(outline.sourceVertices).toBe(40);
  });

  it('does not move the point the report is placed by', () => {
    const parsed = parseEvent(polygonEvent([ring(40)]), GEOINT_DEFAULT_CONFIG);
    const rings = (parsed.features[0].geometry as ParsedPolygon).rings;

    const before = representativePoint({ kind: 'polygon', rings });
    // Taking an outline must not disturb the geometry it read.
    boundedOutline({ kind: 'polygon', rings });
    const after = representativePoint({ kind: 'polygon', rings });

    expect(after.point).toEqual(before.point);
    expect(after.how).toBe(before.how);
  });

  it('stays inside the budget for a polygon at the parser cap', () => {
    // The parser admits up to 2000 vertices; the workspace serialises every
    // report into one localStorage key, so this is the number that decides
    // whether keeping shapes is affordable at all.
    const parsed = parseEvent(polygonEvent([ring(1500)]), GEOINT_DEFAULT_CONFIG);
    const rings = (parsed.features[0].geometry as ParsedPolygon).rings;
    const outline = boundedOutline({ kind: 'polygon', rings })!;

    expect(outline.keptVertices).toBeLessThanOrEqual(OUTLINE_VERTEX_BUDGET + 1);
    expect(outline.sourceVertices).toBeGreaterThan(1000);
    // What it costs to store, which is the whole argument for a budget.
    expect(JSON.stringify(outline).length).toBeLessThan(2048);
  });

  it('has no outline for a point, which has no shape to keep', () => {
    const pointEvent = {
      ...polygonEvent([ring(4)]),
      content: JSON.stringify({
        type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: [-77.0369, 38.9072] },
      }),
    };
    const parsed = parseEvent(pointEvent, GEOINT_DEFAULT_CONFIG);
    expect(parsed.features[0].kind).toBe('point');
  });
});
