/**
 * The legend can only say what was drawn.
 *
 * The failure this guards against is a legend that outlives its marks: a card
 * showing an empty ocean under a key that names six hazard types, or a swatch for
 * a category that stopped being drawn three layers ago. Both read as claims about
 * the image, and an image that has left the app cannot be corrected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishLegend, getLegends, subscribeLegends, resetLegendsForTest, swatchesFromMarks, legendsAsCardsDraw,
} from '../globeLegendStore';

const legend = (over: Partial<Parameters<typeof publishLegend>[1] & object> = {}) => ({
  layerId: 'EcologicalDisasters',
  layer: 'Eco Disasters',
  colorMeans: 'severity',
  swatches: [{ color: '#ff4d4f', label: 'catastrophic' }],
  ...over,
});

describe('publishing what a layer means', () => {
  beforeEach(() => resetLegendsForTest());

  it('holds one entry per layer, replaced rather than accumulated', () => {
    publishLegend('EcologicalDisasters', legend());
    publishLegend('EcologicalDisasters', legend({ colorMeans: 'hazard type' }));

    expect(getLegends()).toHaveLength(1);
    expect(getLegends()[0].colorMeans).toBe('hazard type');
  });

  it('withdraws an entry when the layer stops drawing', () => {
    publishLegend('EcologicalDisasters', legend());
    publishLegend('SpaceWeather', legend({ layerId: 'SpaceWeather', layer: 'Space Weather' }));

    publishLegend('EcologicalDisasters', null);

    expect(getLegends().map((l) => l.layerId)).toEqual(['SpaceWeather']);
  });

  it('tells a subscriber what is drawn now, and on every change', () => {
    const seen: number[] = [];
    const stop = subscribeLegends((legends) => seen.push(legends.length));

    publishLegend('EcologicalDisasters', legend());
    publishLegend('EcologicalDisasters', null);
    stop();
    publishLegend('EcologicalDisasters', legend());

    // The initial call, the publish, the withdrawal — and nothing after unsubscribing.
    expect(seen).toEqual([0, 1, 0]);
  });

  it('stays quiet when asked to withdraw something that was never published', () => {
    const seen: number[] = [];
    subscribeLegends((legends) => seen.push(legends.length));
    publishLegend('Satellites', null);

    expect(seen).toEqual([0]);
  });
});

describe('swatches come from the marks, not from a table', () => {
  it('names each category once, in the order it first appears', () => {
    const swatches = swatchesFromMarks([
      { color: '#ff4d4f', category: 'Earthquake' },
      { color: '#fa8c16', category: 'Wildfire' },
      { color: '#ff4d4f', category: 'Earthquake' },
    ]);

    expect(swatches).toEqual([
      { color: '#ff4d4f', label: 'Earthquake' },
      { color: '#fa8c16', label: 'Wildfire' },
    ]);
  });

  it('produces nothing for a category the layer did not draw', () => {
    // The whole point: three hazard types exist, one is drawn, one swatch.
    expect(swatchesFromMarks([{ color: '#1890ff', category: 'Flood' }])).toHaveLength(1);
    expect(swatchesFromMarks([])).toEqual([]);
  });

  it('skips marks whose colour stands for nothing, rather than inventing a label', () => {
    expect(swatchesFromMarks([{ color: '#ffffff' }, { color: '#ff4d4f', category: 'Earthquake' }]))
      .toEqual([{ color: '#ff4d4f', label: 'Earthquake' }]);
  });

  it('keeps two categories that happen to share a colour apart', () => {
    // colorForSeverity and colorForHazardType both use #ff4d4f — for catastrophic
    // and for earthquake. Collapsing them by colour would drop one from the card.
    expect(swatchesFromMarks([
      { color: '#ff4d4f', category: 'Earthquake' },
      { color: '#ff4d4f', category: 'catastrophic' },
    ])).toHaveLength(2);
  });
});

describe('a swatch as a card draws it (theatre-lens.md, TL5)', () => {
  it('reads as the card draws, where a card draws more than the screen, and is otherwise unchanged', () => {
    const outer = { color: '#ff4d4f', label: 'outlined: on a war\'s list', shape: 'line', card: { label: 'hatched: on a war\'s list', shape: 'hatch' } };
    const plain = { color: '#ff4d4f', label: 'Major war', shape: 'area' };
    const entry = legend({ swatches: [plain, outer] });
    const asCard = legendsAsCardsDraw([entry]);
    expect(asCard[0].swatches).toEqual([plain, { color: '#ff4d4f', label: 'hatched: on a war\'s list', shape: 'hatch' }]);
    // The screen's own entry is left as it was.
    expect(entry.swatches[1]).toBe(outer);
    expect(legendsAsCardsDraw([legend()])).toEqual([legend()]);
  });
});
