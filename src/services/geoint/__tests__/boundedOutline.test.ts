/**
 * The outline kept in place of a discarded shape.
 *
 * Two things must hold or the record lies. It must stay inside its budget,
 * because the budget is the whole reason an outline is storable at all; and it
 * must report what it dropped, because a simplified shape drawn like an exact
 * one is a false claim on the surface where the shape IS the claim.
 */
import { describe, it, expect } from 'vitest';
import { boundedOutline, OUTLINE_VERTEX_BUDGET } from '../boundedOutline';
import type { ParsedPoint } from '../types';

const ring = (n: number): ParsedPoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: i * 0.001, lon: i * 0.002 }));

describe('boundedOutline', () => {
  it('keeps a small shape exactly, and says nothing was dropped', () => {
    const outline = boundedOutline({ kind: 'polygon', rings: [ring(10)] })!;
    expect(outline.sourceVertices).toBe(10);
    expect(outline.keptVertices).toBe(10);
    expect(outline.parts[0]).toHaveLength(10);
  });

  it('stays inside the budget for a shape far past it', () => {
    const outline = boundedOutline({ kind: 'polygon', rings: [ring(2000)] })!;
    expect(outline.sourceVertices).toBe(2000);
    // The budget is what makes this storable; +1 for the always-kept last
    // vertex, which is the one exception and is bounded per part.
    expect(outline.keptVertices).toBeLessThanOrEqual(OUTLINE_VERTEX_BUDGET + 1);
  });

  it('reports the drop rather than presenting the outline as the shape', () => {
    const outline = boundedOutline({ kind: 'polygon', rings: [ring(500)] })!;
    expect(outline.keptVertices).toBeLessThan(outline.sourceVertices);
  });

  it('always keeps the last vertex, so a ring does not close on a notch', () => {
    // 102 vertices gives stride 2, so the loop lands on 0,2,…,100 and MISSES
    // the final index 101. The first version of this test used 101 vertices,
    // where the loop happens to hit the last index on its own — it passed with
    // the always-keep-last rule deleted, which is no test at all.
    const source = ring(102);
    const outline = boundedOutline({ kind: 'polygon', rings: [source] })!;
    const last = outline.parts[0][outline.parts[0].length - 1];
    expect(last[0]).toBeCloseTo(source[101].lat, 5);
    expect(last[1]).toBeCloseTo(source[101].lon, 5);
  });

  it('keeps every ring of a polygon, holes included', () => {
    const outline = boundedOutline({ kind: 'polygon', rings: [ring(40), ring(20)] })!;
    expect(outline.parts).toHaveLength(2);
    expect(outline.sourceVertices).toBe(60);
  });

  it('carries a line as one part', () => {
    const outline = boundedOutline({ kind: 'line', coords: ring(8) })!;
    expect(outline.kind).toBe('line');
    expect(outline.parts).toHaveLength(1);
  });

  it('is nothing for a shape with no shape in it', () => {
    // A single coordinate is not an area; the representative point already
    // says where it is, and an outline would imply an extent nobody stated.
    expect(boundedOutline({ kind: 'polygon', rings: [[{ lat: 1, lon: 2 }]] })).toBeNull();
    expect(boundedOutline({ kind: 'line', coords: [] })).toBeNull();
  });

  it('rounds to metres, not to whatever the publisher typed', () => {
    const outline = boundedOutline({
      kind: 'line',
      coords: [{ lat: 38.907200123456, lon: -77.036900987654 }, { lat: 39, lon: -77 }],
    })!;
    expect(outline.parts[0][0]).toEqual([38.9072, -77.0369]);
  });
});
