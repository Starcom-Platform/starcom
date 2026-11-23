/**
 * Raver Watch's marks (globe record, section 19, Phase 1 step 3): one atlas
 * of nine glyphs in three rows, a row per level. Red is a red glow, amber an
 * amber ring, info a disc edged in the mode's violet; the glyph, drawn light
 * with a dark outline, is the category. Drawn through the same sprite builder
 * as Intel Reports, whose per-mark opacity is what fades an item near its end.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  raverWatchCellSvg, RAVER_WATCH_LAYOUT, RAVER_WATCH_LEVELS, RAVER_WATCH_LEVEL_LOOK, RAVER_WATCH_SPRITE_TYPE,
  raverWatchSpriteMark, raverWatchAtlasRows,
} from '../raverWatchSprites';
import { buildGlyphSprites } from '../intelReportSprites';
import { RAVER_WATCH_GLYPHS } from '../../../services/raverWatch/raverWatchView';
import type { RaverWatchItem } from '../../../services/raverWatch/raverWatch';

const DAY = 86_400;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'SceneIncidents', category: 'heat', title: 'Heat at the main stage', source: 'Mixmag',
  validFrom: 100 * DAY, validUntil: 107 * DAY, content: 'words', level: 'amber', point: { lat: 52.5, lon: 13.4 }, ...over,
});

describe('the atlas', () => {
  it('is a row per level and a cell per glyph', () => {
    expect(RAVER_WATCH_LAYOUT).toEqual({ cellCount: RAVER_WATCH_GLYPHS.length, rowCount: 3, type: RAVER_WATCH_SPRITE_TYPE });
    const rows = raverWatchAtlasRows();
    expect(rows).toHaveLength(RAVER_WATCH_LEVELS.length);
    for (const row of rows) expect(row).toHaveLength(RAVER_WATCH_GLYPHS.length);
  });

  it('draws each level as its backing, in its colour', () => {
    expect(RAVER_WATCH_LEVEL_LOOK.red.backing).toBe('glow');
    expect(RAVER_WATCH_LEVEL_LOOK.amber.backing).toBe('ring');
    expect(RAVER_WATCH_LEVEL_LOOK.info.backing).toBe('disc');
    for (const level of RAVER_WATCH_LEVELS) {
      expect(raverWatchCellSvg('heat', level)).toContain(RAVER_WATCH_LEVEL_LOOK[level].color);
    }
    expect(raverWatchCellSvg('heat', 'red')).toContain('radialGradient');
    expect(raverWatchCellSvg('heat', 'info')).not.toContain('radialGradient');
  });

  it('draws every glyph differently, and needs nothing from outside itself, as the CSP requires', () => {
    const cells = RAVER_WATCH_GLYPHS.map((glyph) => raverWatchCellSvg(glyph, 'amber'));
    expect(new Set(cells).size).toBe(cells.length);
    for (const cell of cells) {
      expect(cell).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(cell.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/https?:|href="(?!#)/);
    }
  });
});

describe('a mark', () => {
  const at = new THREE.Vector3(1, 2, 3);
  const live = (atS: number) => ({ atS, window: null });

  it('is drawn from its glyph’s cell and its level’s row, dated from when it applies', () => {
    const mark = raverWatchSpriteMark(item(), at, live(101 * DAY), () => 'said');
    expect(mark).toMatchObject({
      position: at, cell: RAVER_WATCH_GLYPHS.indexOf('heat'), row: RAVER_WATCH_LEVELS.indexOf('amber'),
      opacity: 1, tooltip: 'said', timeMs: 100 * DAY * 1000,
    });
    // A size a mark can be seen at: undefined draws nothing, and no test of shape would notice.
    expect(mark.sizePx).toBeGreaterThanOrEqual(20);
  });

  it('fades near its end', () => {
    expect(raverWatchSpriteMark(item(), at, live(106.9 * DAY), () => '').opacity).toBeLessThan(0.5);
  });

  it('moves only when it is red', () => {
    expect(raverWatchSpriteMark(item({ level: 'red' }), at, live(101 * DAY), () => '').motion).toBeGreaterThan(0);
    expect(raverWatchSpriteMark(item(), at, live(101 * DAY), () => '').motion).toBe(0);
  });

  it('is built into one object, from its own atlas, with each mark’s opacity', () => {
    const marks = [
      raverWatchSpriteMark(item(), at, live(101 * DAY), () => 'a'),
      raverWatchSpriteMark(item({ id: 'b', level: 'red' }), at, live(106.9 * DAY), () => 'b'),
    ];
    const object = buildGlyphSprites(marks, new THREE.Texture(), RAVER_WATCH_LAYOUT)!;
    const material = object.material as THREE.ShaderMaterial;
    expect(object.userData).toMatchObject({ type: RAVER_WATCH_SPRITE_TYPE, tooltips: ['a', 'b'] });
    expect(material.uniforms.cellCount.value).toBe(RAVER_WATCH_GLYPHS.length);
    expect(material.uniforms.rowCount.value).toBe(3);
    const opacities = Array.from((object.geometry.getAttribute('markOpacity') as THREE.BufferAttribute).array);
    expect(opacities[0]).toBe(1);
    expect(opacities[1]).toBeLessThan(0.5);
  });
});
