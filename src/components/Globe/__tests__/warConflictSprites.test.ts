/**
 * War & Conflict's marks (decisions WC1-WC3): one atlas of twelve glyphs in
 * three rows, a row per backing. A critical warning glows in the token set's
 * danger red and moves; a line that reports deaths is ringed in it; any other
 * report is a disc edged in a quiet light grey, since it asks nothing. The
 * glyph is what happened. Colours come from src/styles/tokens.ts, none written
 * here. Drawn through the same sprite builder as Intel Reports and Raver Watch.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  warConflictCellSvg, warConflictAtlasRows, warConflictSpriteMark, WAR_CONFLICT_LAYOUT, WAR_CONFLICT_SPRITE_TYPE,
  WAR_CONFLICT_BACKING_LOOK,
} from '../warConflictSprites';
import { CONFLICT_BACKINGS, CONFLICT_GLYPHS } from '../../../services/warConflict/warConflictView';
import { GUNMETAL, SEMANTIC } from '../../../styles/tokens';
import type { ConflictItem } from '../../../services/warConflict/warConflict';

const NOW = 1_791_000_000;
const item = (over: Partial<ConflictItem> = {}): ConflictItem => ({
  family: 'item', id: '30023:pk:starcom-intel-conflict-x', pubkey: 'pk', d: 'starcom-intel-conflict-x', eventId: 'e', createdAt: NOW,
  title: 'An airstrike', reportedAt: NOW, content: 'words', events: [{ id: 'airstrike', label: 'Airstrike' }], casualties: [],
  fatal: false, actors: [], point: { lat: 35, lon: 71.2 }, ...over,
});

describe('the atlas', () => {
  it('is a row per backing and a cell per glyph', () => {
    expect(WAR_CONFLICT_LAYOUT).toEqual({ cellCount: CONFLICT_GLYPHS.length, rowCount: 3, type: WAR_CONFLICT_SPRITE_TYPE });
    const rows = warConflictAtlasRows();
    expect(rows).toHaveLength(CONFLICT_BACKINGS.length);
    for (const row of rows) expect(row).toHaveLength(CONFLICT_GLYPHS.length);
  });

  it('draws a critical warning as a danger glow, deaths as a danger ring, and a report as a quiet disc', () => {
    expect(WAR_CONFLICT_BACKING_LOOK.critical).toMatchObject({ backing: 'glow', color: SEMANTIC.danger });
    expect(WAR_CONFLICT_BACKING_LOOK.deadly).toMatchObject({ backing: 'ring', color: SEMANTIC.danger });
    expect(WAR_CONFLICT_BACKING_LOOK.report).toMatchObject({ backing: 'disc', color: GUNMETAL[300] });
    expect(warConflictCellSvg('strike', 'critical')).toContain('radialGradient');
    for (const backing of CONFLICT_BACKINGS) expect(warConflictCellSvg('strike', backing)).toContain(WAR_CONFLICT_BACKING_LOOK[backing].color);
  });

  it('gives every glyph its own drawing', () => {
    const cells = CONFLICT_GLYPHS.map((glyph) => warConflictCellSvg(glyph, 'report'));
    expect(new Set(cells).size).toBe(CONFLICT_GLYPHS.length);
  });

  it('moves only a critical warning', () => {
    expect(WAR_CONFLICT_BACKING_LOOK.critical.motion).toBeGreaterThan(0);
    expect(WAR_CONFLICT_BACKING_LOOK.deadly.motion).toBe(0);
    expect(WAR_CONFLICT_BACKING_LOOK.report.motion).toBe(0);
  });
});

describe('one item as a mark', () => {
  const mark = (over: Partial<ConflictItem> = {}, atS = NOW) =>
    warConflictSpriteMark(item(over), new THREE.Vector3(1, 2, 3), { atS, window: null }, (it) => `hover: ${it.title}`);

  it('its glyph is what happened, its row its backing', () => {
    expect(mark()).toMatchObject({ cell: CONFLICT_GLYPHS.indexOf('strike'), row: CONFLICT_BACKINGS.indexOf('report') });
    expect(mark({ fatal: true })).toMatchObject({ row: CONFLICT_BACKINGS.indexOf('deadly') });
    expect(mark({ role: 'critical', events: [{ id: 'airspace_warning', label: '' }] })).toMatchObject({
      cell: CONFLICT_GLYPHS.indexOf('warning'), row: CONFLICT_BACKINGS.indexOf('critical'),
    });
  });

  it('faded near its end, dated when it was reported, with its hover', () => {
    expect(mark().opacity).toBe(1);
    expect(mark({}, NOW + 70 * 3_600).opacity).toBeLessThan(1);
    expect(mark()).toMatchObject({ timeMs: NOW * 1000, tooltip: 'hover: An airstrike' });
  });
});
