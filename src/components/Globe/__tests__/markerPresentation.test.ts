/**
 * The marker decides what it is called — not the mode.
 *
 * The globe's interaction layer worked out the tooltip label, the confidence
 * tag, and the screen-reader announcement from `subMode === 'RLSH'`. That is
 * only correct while RLSH is the PRIMARY mode, and useGlobeLayerControl already
 * lets an operator PIN a layer so it renders while another mode is primary —
 * every data renderer honours pins, this file did not.
 *
 * These assert the case that could not previously happen: a marker of one kind
 * hovered while the other kind is primary.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { describeHoveredMarker } from '../markerPresentation';

const model = (kind?: 'intel' | 'rlsh') => ({ report: kind ? { kind } : {} });

describe('describeHoveredMarker', () => {
  it('names an RLSH marker correctly while INTEL is the primary mode', () => {
    // The pinned-layer case. Under the old rule this said "Intel Report",
    // because it asked the mode instead of the thing under the pointer.
    const p = describeHoveredMarker(model('rlsh'), 'intel');
    expect(p.entityLabel).toBe('RLSH Entity');
    expect(p.showConfidenceTag).toBe(true);
  });

  it('names an INTEL marker correctly while RLSH is the primary mode', () => {
    // The mirror case, and the one that mattered for the confidence tag:
    // geoConfidence is a property only RLSH markers carry, so this offered a
    // tag for a field that does not exist on the hovered object.
    const p = describeHoveredMarker(model('intel'), 'rlsh');
    expect(p.entityLabel).toBe('Intel Report');
    expect(p.showConfidenceTag).toBe(false);
  });

  it('falls back to the primary mode when nothing is hovered', () => {
    // Then the label describes no object at all, so the mode is the best
    // available guess. An integration test caught this: reading the marker
    // unconditionally reported "Intel Report" in RLSH mode with an empty
    // pointer, regressing the one state the old code got right for free.
    expect(describeHoveredMarker(null, 'rlsh').entityLabel).toBe('RLSH Entity');
    expect(describeHoveredMarker(undefined, 'intel').entityLabel).toBe('Intel Report');
  });

  it('treats a marker with no stated kind as intel', () => {
    // Every marker predates the kind field, so absent must mean intel or the
    // legacy corpus routes nowhere.
    expect(describeHoveredMarker(model(), 'rlsh').entityLabel).toBe('Intel Report');
  });

  it('keeps label and confidence tag consistent with each other', () => {
    // They were two independent reads of the same mode flag and could in
    // principle disagree; now they derive from one resolved kind.
    for (const kind of ['intel', 'rlsh'] as const) {
      for (const primary of ['intel', 'rlsh'] as const) {
        const p = describeHoveredMarker(model(kind), primary);
        expect(p.showConfidenceTag).toBe(p.entityLabel === 'RLSH Entity');
        expect(p.kind).toBe(kind);
      }
    }
  });
});
