/**
 * The key to the borders, derived from the borders actually drawn (decision
 * D-F, 2026-09-19).
 *
 * It replaces a key typed into GeopoliticalLayersPopup by hand, which was wrong
 * in two ways at once: it showed International as one green swatch when
 * international borders came in four hashed colours, and it drew every swatch
 * solid, so it never said that the dash is what marks a provisional border.
 */
import { describe, it, expect } from 'vitest';
import { bordersLegendFrom, countriesLegend, drawnBorderKinds, legendsInStyle, BORDERS_LEGEND_ID, COUNTRIES_KEY_LABEL, COUNTRIES_LEGEND_ID } from '../theme/borderLegend';
import { BORDER_SWATCHES, CLASSIC_FILL_COLOURS, CLASSIC_INTERNATIONAL_BORDER } from '../theme/territoryStyles';
import type { BorderClassification } from '../theme/materialTheme';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { replaceGroupContentsWithCrossFade } from '../utils/groupFade';
import * as THREE from 'three';
import { BORDER_CLASS_COLORS } from '../theme/materialTheme';
import { cssColorOf } from '../../services/globe/globeLegendStore';

describe('bordersLegendFrom', () => {
  it('says nothing when no border was drawn', () => {
    expect(bordersLegendFrom([])).toBeNull();
  });

  it('names each kind of boundary drawn, in the colour it was drawn in', () => {
    const legend = bordersLegendFrom(['international', 'disputed', 'international']);

    expect(legend?.layerId).toBe(BORDERS_LEGEND_ID);
    expect(legend?.swatches).toEqual([
      expect.objectContaining({ color: cssColorOf(BORDER_CLASS_COLORS.international) }),
      expect.objectContaining({ color: cssColorOf(BORDER_CLASS_COLORS.disputed) }),
    ]);
  });

  /*
   * The store's rule: the categories a layer actually drew, never the ones it
   * could draw. With disputed borders hidden by the setting, the key must not
   * offer a swatch for them.
   */
  it('offers no swatch for a kind of boundary that was not drawn', () => {
    const labels = bordersLegendFrom(['international', 'indefinite'])!.swatches.map((s) => s.label);

    expect(labels.some((l) => /disputed/i.test(l))).toBe(false);
    expect(labels.some((l) => /control/i.test(l))).toBe(false);
  });

  it('lists each kind once, however many borders of it were drawn', () => {
    expect(bordersLegendFrom(Array(344).fill('international'))!.swatches).toHaveLength(1);
  });

  /*
   * What the hand-typed key never said. A provisional border's swatch is a
   * DASHED line and a settled one's is solid, so the key shows the one
   * distinction that is not carried by colour alone.
   */
  it('draws a provisional border\'s swatch dashed and a settled one\'s solid', () => {
    const swatches = bordersLegendFrom(['international', 'disputed', 'line_of_control', 'indefinite'])!.swatches;
    const shapeOf = (re: RegExp) => swatches.find((s) => re.test(s.label))?.shape;

    expect(shapeOf(/international/i)).toBe('line');
    expect(shapeOf(/indefinite/i)).toBe('line');
    expect(shapeOf(/disputed/i)).toBe('dashed');
    expect(shapeOf(/control/i)).toBe('dashed');
  });

  it('says in words that the dash marks a boundary that is not settled', () => {
    expect(bordersLegendFrom(['international', 'disputed'])!.colorMeans).toMatch(/dash/i);
  });

  /*
   * Stable order, settled first: the key should not reshuffle whenever the
   * level of detail changes and the borders arrive in a different order.
   */
  it('orders the kinds the same way whatever order the borders arrived in', () => {
    const a = bordersLegendFrom(['disputed', 'international', 'indefinite'])!.swatches.map((s) => s.label);
    const b = bordersLegendFrom(['indefinite', 'disputed', 'international'])!.swatches.map((s) => s.label);

    expect(a).toEqual(b);
    expect(a[0]).toMatch(/international/i);
  });
});

/*
 * From the scene, not from a list: the key is derived from the batches the
 * real service built, so it cannot describe a border that was never drawn.
 * Built here by nationalTerritoriesService.buildBorders itself — the same call
 * the hook makes — rather than hand-made batches that would agree with
 * whatever this test expected.
 */
describe('bordersLegendFrom(drawnBorderKinds(…))', () => {
  const baseConfig: any = {
    borderVisibility: 70, borderThickness: 1,
    territoryColors: { opacity: 50, useCustomColors: false },
    showDisputedTerritories: true,
  };
  const features: any = [
    { id: 'i1', coordinates: [[0, 0], [1, 1]], classification: 'international' },
    { id: 'i2', coordinates: [[4, 0], [5, 1]], classification: 'international' },
    { id: 'd', coordinates: [[2, 0], [3, 1]], classification: 'disputed' },
    { id: 'l', coordinates: [[6, 0], [7, 1]], classification: 'line_of_control' },
  ];

  it('names the kinds the real service drew, dashed where provisional', () => {
    const group = nationalTerritoriesService.buildBorders(features, baseConfig);
    const swatches = bordersLegendFrom(drawnBorderKinds(group))!.swatches;

    expect(swatches.map((s) => [s.label, s.shape])).toEqual([
      ['international boundary', 'line'],
      ['disputed', 'dashed'],
      ['line of control', 'dashed'],
    ]);
  });

  /*
   * The setting that hides disputed borders filters them out inside
   * buildBorders. A key read from the scene follows it for free; a key typed in
   * by hand went on offering a swatch for borders that were not there.
   */
  it('drops the disputed swatch when the setting hides disputed borders', () => {
    const group = nationalTerritoriesService.buildBorders(features, { ...baseConfig, showDisputedTerritories: false });
    const labels = bordersLegendFrom(drawnBorderKinds(group))!.swatches.map((s) => s.label);

    expect(labels).not.toContain('disputed');
    expect(labels).not.toContain('line of control');
  });

  it('reads every group it is given, and skips one that is missing', () => {
    const land = nationalTerritoriesService.buildBorders(features.slice(0, 1), baseConfig);
    const other = nationalTerritoriesService.buildBorders(features.slice(2, 3), baseConfig);

    expect(bordersLegendFrom(drawnBorderKinds(land, null, other))!.swatches.map((s) => s.label))
      .toEqual(['international boundary', 'disputed']);
  });

  it('says nothing when the groups hold no borders', () => {
    expect(bordersLegendFrom(drawnBorderKinds(null, undefined))).toBeNull();
  });
});

/*
 * Which group to read after a change in level of detail — the mistake the first
 * version made, pinned with the real crossfade rather than described.
 *
 * useNationalTerritories3D read the key off the NEWLY BUILT group, reasoning
 * that a crossfade leaves the ref holding the outgoing level. It does the
 * opposite: replaceGroupContentsWithCrossFade moves the incoming borders INTO
 * the ref's group (three.js's add reparents) and the outgoing ones into a
 * separate fading group. The new group is left empty, so the key read from it
 * was null and publishing null withdrew it. Every other test here passed; the
 * running globe showed a key with no borders in it.
 */
describe('after a change in level of detail', () => {
  const cfg: any = {
    borderVisibility: 70, borderThickness: 1,
    territoryColors: { opacity: 50, useCustomColors: false },
    showDisputedTerritories: true,
  };
  const build = (features: any[]) => nationalTerritoriesService.buildBorders(features, cfg);

  it('holds the drawn borders in the ref, and leaves the new group empty', () => {
    const scene = new THREE.Scene();
    const ref = build([{ id: 'old', coordinates: [[0, 0], [1, 1]], classification: 'international' }]);
    scene.add(ref);
    const incoming = build([
      { id: 'i', coordinates: [[0, 0], [1, 1]], classification: 'international' },
      { id: 'd', coordinates: [[2, 0], [3, 1]], classification: 'disputed' },
    ]);

    replaceGroupContentsWithCrossFade(ref, incoming, { reducedMotion: true });

    expect(bordersLegendFrom(drawnBorderKinds(incoming))).toBeNull();
    expect(bordersLegendFrom(drawnBorderKinds(ref))!.swatches.map((s) => s.label))
      .toEqual(['international boundary', 'disputed']);
  });
});

describe('the key in each territories style (decision K5)', () => {
  it('draws a settled border\'s swatch green in Classic and pale in Quiet, the rest alike', () => {
    const classic = bordersLegendFrom(['international', 'disputed'], 'classic')!.swatches;
    const quiet = bordersLegendFrom(['international', 'disputed'], 'quiet')!.swatches;
    expect(classic[0].color).toBe(cssColorOf(CLASSIC_INTERNATIONAL_BORDER));
    expect(quiet[0].color).not.toBe(classic[0].color);
    expect(classic[1].color).toBe(quiet[1].color);
  });

  it('keys each kind of border in the colour its look gives it', () => {
    const look = { borderColours: { international: 'blue', disputed: 'violet', line_of_control: 'amber', indefinite: 'grey' } } as const;
    const legend = bordersLegendFrom(['international', 'disputed'], 'quiet', look)!;
    expect(legend.swatches.map((s) => s.color)).toEqual([cssColorOf(BORDER_SWATCHES.blue.hex), cssColorOf(BORDER_SWATCHES.violet.hex)]);
  });

  it('says what Classic\'s four fills mean, which is only that neighbours differ, and says nothing for Quiet', () => {
    const legend = countriesLegend('classic', true)!;
    expect(legend.layerId).toBe(COUNTRIES_LEGEND_ID);
    expect(legend.colorMeans).toMatch(/no two that share a border/);
    expect(legend.swatches.map((s) => s.color)).toEqual(CLASSIC_FILL_COLOURS.map((c) => cssColorOf(c)));
    expect(legend.swatches.every((s) => s.shape === 'area')).toBe(true);
    // One line: the four swatches run together, named once by the last (owner, 2026-10-08).
    expect(legend.swatches.map((s) => s.label)).toEqual(['', '', '', COUNTRIES_KEY_LABEL]);
    expect(COUNTRIES_KEY_LABEL).toBe('one colour each; neighbours never share one');
    expect(countriesLegend('quiet', true)).toBeNull();
    expect(countriesLegend('classic', false)).toBeNull();
  });

  it('puts a style\'s territories entries after every other, wherever the published key had them', () => {
    const a = { layerId: 'A', layer: 'A', swatches: [] };
    const b = { layerId: 'B', layer: 'B', swatches: [] };
    const drawn = { borderKinds: ['international'] as BorderClassification[], fills: true };
    // The borders published first, as they do when the territories finish loading before the layers.
    const published = [bordersLegendFrom(['international'], 'quiet')!, a, b];
    expect(legendsInStyle(published, 'classic', drawn).map((l) => l.layerId))
      .toEqual(['A', 'B', BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID]);
    expect(legendsInStyle([a], 'quiet', drawn).map((l) => l.layerId)).toEqual(['A', BORDERS_LEGEND_ID]);
  });
});
