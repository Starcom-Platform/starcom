/**
 * A card carries the caveats that apply to what it shows (decision D-F, step 2).
 * Its analysis caveats come from the analysis marks the globe hands it, and the
 * globe handed them to every card whatever layer it showed, so a submarine cable
 * card said the working set held nothing to analyse. Analysis marks are drawn only
 * while the Intel Reports layer is on, so a card gets them only then.
 */
import { describe, it, expect } from 'vitest';
import { analysisMarksForCard } from '../analysisMarksForCard';

type Integrity = { totalObservations: number; mockCount: number; realRatio: number };
const layer = (over: { integrity?: Integrity | null; emptyReason?: 'no-observations' | 'nothing-qualified' | 'all-unplaceable' | null } = {}) => ({
  integrity: null as Integrity | null,
  emptyReason: null as 'no-observations' | 'nothing-qualified' | 'all-unplaceable' | null,
  ...over,
});

describe('analysisMarksForCard', () => {
  it('gives a card no analysis marks while the Intel Reports layer is not drawing them', () => {
    expect(analysisMarksForCard({
      layerDrawn: false,
      markers: [{}, {}],
      layers: [layer({ emptyReason: 'no-observations' })],
    })).toBeNull();
  });

  it('explains an empty analysis while the layer is drawn', () => {
    expect(analysisMarksForCard({
      layerDrawn: true,
      markers: [],
      layers: [layer(), layer({ emptyReason: 'nothing-qualified' })],
    })).toEqual({ shown: 0, fabricated: null, totalObservations: null, emptyReason: 'nothing-qualified' });
  });

  it('counts the marks shown, and gives no empty reason when there are marks', () => {
    const marks = analysisMarksForCard({
      layerDrawn: true,
      markers: [{}, {}, {}],
      layers: [layer({ emptyReason: 'no-observations' })],
    });
    expect(marks?.shown).toBe(3);
    expect(marks?.emptyReason).toBeNull();
  });

  it('reports fabrication only when every layer measured it', () => {
    const measured = { totalObservations: 9, mockCount: 2, realRatio: 7 / 9 };
    const clean = { totalObservations: 1, mockCount: 0, realRatio: 1 };

    expect(analysisMarksForCard({ layerDrawn: true, markers: [{}], layers: [layer({ integrity: measured }), layer({ integrity: clean })] }))
      .toMatchObject({ fabricated: 2, totalObservations: 10 });
    expect(analysisMarksForCard({ layerDrawn: true, markers: [{}], layers: [layer({ integrity: measured }), layer()] }))
      .toMatchObject({ fabricated: null, totalObservations: null });
    expect(analysisMarksForCard({ layerDrawn: true, markers: [], layers: [] }))
      .toEqual({ shown: 0, fabricated: null, totalObservations: null, emptyReason: null });
  });
});
