/**
 * The shared substrate under every screen-space mark layer.
 *
 * Two properties are load-bearing and neither is visible in a screenshot:
 *
 *   · the geometry is rebuilt when the marks CHANGE, not when the globe happens to
 *     re-render. A caller writing `userData={{ samples: n }}` inline hands this a
 *     new object every render, and an effect keyed on that object would drop and
 *     rebuild five hundred points on every render.
 *   · the legend is published with the marks and withdrawn with them, so a card
 *     cannot carry a key for something the frame does not contain.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useScreenMarkLayer, resolveMarkColor, type ScreenMark } from '../useScreenMarkLayer';
import { SURFACE_MARKS } from '../../globeAltitudes';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const marks: ScreenMark[] = [
  { lat: 10, lng: 20, sizePx: 9, color: '#ff4d4f', category: 'Earthquake', tooltip: 'M5.1' },
  { lat: -8, lng: 115, sizePx: 12, color: '#fa8c16', category: 'Wildfire' },
];

const drawn = (group: THREE.Group) =>
  group.children.find((c) => c.userData.type === 'testMarks') as THREE.Points | undefined;

const render = (props: { enabled?: boolean; marks?: ScreenMark[] } = {}) => renderHook(
  ({ enabled, marks: m }) => useScreenMarkLayer({
    scene: new THREE.Scene(),
    enabled,
    marks: m,
    altitude: SURFACE_MARKS,
    type: 'testMarks',
    // Deliberately inline, the way a layer reads best — and the identity trap.
    userData: { count: m.length },
    legend: { layerId: 'TestLayer', layer: 'Test Layer', colorMeans: 'hazard type' },
  }),
  { initialProps: { enabled: props.enabled ?? true, marks: props.marks ?? marks } },
);

describe('when the marks are rebuilt', () => {
  beforeEach(() => resetLegendsForTest());

  it('keeps the same geometry across a re-render that changed nothing', () => {
    const { result, rerender } = render();
    const first = drawn(result.current.groupRef.current);

    rerender({ enabled: true, marks });

    expect(drawn(result.current.groupRef.current)).toBe(first);
  });

  it('rebuilds when the marks themselves change', () => {
    const { result, rerender } = render();
    const first = drawn(result.current.groupRef.current);

    rerender({ enabled: true, marks: [{ ...marks[0], lat: 44 }] });

    const next = drawn(result.current.groupRef.current)!;
    expect(next).not.toBe(first);
    expect(next.geometry.getAttribute('position').count).toBe(1);
  });
});

describe('the legend the layer publishes', () => {
  beforeEach(() => resetLegendsForTest());

  it('names only the categories the layer actually drew', () => {
    render();

    expect(getLegends()).toEqual([{
      layerId: 'TestLayer',
      layer: 'Test Layer',
      colorMeans: 'hazard type',
      swatches: [
        { color: '#ff4d4f', label: 'Earthquake' },
        { color: '#fa8c16', label: 'Wildfire' },
      ],
    }]);
  });

  it('withdraws it when the layer stops drawing', () => {
    const { rerender } = render();
    expect(getLegends()).toHaveLength(1);

    rerender({ enabled: false, marks });

    expect(getLegends()).toEqual([]);
  });

  it('withdraws it when the layer has nothing to draw', () => {
    // An empty layer is not a layer with an empty legend: a key under a globe with
    // no marks on it reads as a claim that the categories are out there somewhere.
    const { rerender } = render();
    rerender({ enabled: true, marks: [] });

    expect(getLegends()).toEqual([]);
  });

  it('takes a numeric colour into the swatch as the CSS the card draws', () => {
    expect(resolveMarkColor('#ff4d4f')).toBe(0xff4d4f);
    expect(resolveMarkColor(0x0088ff)).toBe(0x0088ff);
  });
});

/*
 * The style a layer draws with reaches the shader (decision D-F, step 6).
 *
 * This hook is the shared substrate under several layers, so it is where the
 * choice has to arrive — a switcher that stores a style nobody passes down is
 * the setting-not-a-feature failure the step warns about. Asserted on the
 * material's defines, the way screenPoints.test.ts asserts the styles
 * themselves, because a style that does not reach the compiled shader is
 * indistinguishable from one that does at every other level.
 */
const renderWithStyle = (style?: 'disc' | 'glow' | 'ring') => renderHook(() => useScreenMarkLayer({
  scene: new THREE.Scene(),
  enabled: true,
  marks,
  altitude: SURFACE_MARKS,
  type: 'testMarks',
  style,
}));

const definesOf = (group: THREE.Group) => {
  const points = drawn(group)!;
  return (points.material as THREE.ShaderMaterial).defines ?? {};
};

describe('the style a layer chose', () => {
  /*
   * A glowing layer draws ONE object here, like every other style.
   *
   * It drew two until 2026-09-18 — an additive bloom, then a disc over it —
   * because a bare additive mark at the intel anchors' ~8px measured as very
   * nearly invisible. That pairing living in this hook is why the ten layers
   * calling buildScreenPoints directly could not offer a glow at all, so it moved
   * into the shader (GLOW_QUAD_SCALE). These tests pin that nothing here
   * special-cases a glow any more: a second object would be an unowned draw call
   * and an extra raycast target at every mark.
   */
  it('reaches the shader as a glow, rather than being unpicked into a disc', () => {
    const defines = definesOf(renderWithStyle('glow').result.current.groupRef.current);

    expect(defines).toHaveProperty('STYLE_GLOW');
    expect(defines).not.toHaveProperty('STYLE_RING');
  });

  it('draws one object, not a bloom and a mark', () => {
    for (const style of ['disc', 'glow', 'ring'] as const) {
      expect(renderWithStyle(style).result.current.groupRef.current.children).toHaveLength(1);
    }
  });

  it('leaves the marks the size the layer asked for', () => {
    // The old bloom object was 2.2x the mark. The quad is still enlarged for a
    // glow, but in the shader — the size a layer passes is untouched here.
    const sizeOf = (g: THREE.Group) =>
      (drawn(g)! as THREE.Points).geometry.getAttribute('pointSize').getX(0);

    expect(sizeOf(renderWithStyle('glow').result.current.groupRef.current))
      .toBe(sizeOf(renderWithStyle('disc').result.current.groupRef.current));
  });

  /*
   * The bloom object used to sit at the same place as the mark, so a raycast hit
   * both, and useGlobePointTooltips takes the first NON-NULL tooltip across every
   * intersection — a bloom carrying tooltips could answer a hover meant for the
   * mark, with the same text, which is why it would never have looked broken. One
   * object per layer is what retires that hazard, so this checks the layer's own
   * tooltips are on the one object that exists.
   */
  it('puts the tooltips on the object it draws, whatever the style', () => {
    for (const style of ['disc', 'glow', 'ring'] as const) {
      const { result, unmount } = renderWithStyle(style);
      const group = result.current.groupRef.current;

      expect(group.children).toHaveLength(1);
      expect((drawn(group)!.userData as { tooltips?: string[] }).tooltips ?? [])
        .toHaveLength(marks.length);
      unmount();
    }
  });

  it('reaches the shader as a ring', () => {
    const { result } = renderWithStyle('ring');

    expect(definesOf(result.current.groupRef.current)).toHaveProperty('STYLE_RING');
  });

  /*
   * A layer that passes nothing keeps drawing exactly what it drew before this
   * option existed. Thirteen of fourteen call sites are in that position, so a
   * default that changed anything would restyle most of the globe at once.
   */
  it('leaves a layer that chose nothing drawing a disc', () => {
    const defines = definesOf(renderWithStyle().result.current.groupRef.current);

    expect(defines).not.toHaveProperty('STYLE_GLOW');
    expect(defines).not.toHaveProperty('STYLE_RING');
  });

  it('redraws when the style changes, or the choice would not take effect', () => {
    const { result, rerender } = renderHook(
      ({ style }) => useScreenMarkLayer({
        scene: new THREE.Scene(), enabled: true, marks, altitude: SURFACE_MARKS,
        type: 'testMarks', style,
      }),
      { initialProps: { style: 'disc' as 'disc' | 'glow' | 'ring' } },
    );
    expect(definesOf(result.current.groupRef.current)).not.toHaveProperty('STYLE_RING');

    rerender({ style: 'ring' });

    expect(definesOf(result.current.groupRef.current)).toHaveProperty('STYLE_RING');
  });
});
