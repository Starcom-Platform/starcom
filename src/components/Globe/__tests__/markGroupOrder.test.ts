/**
 * Every mark a person clicks draws after the country names (decision K5, step 4).
 *
 * The names draw at group order 130, in the globe's own scene, under every mark:
 * three.js sorts see-through objects by their nearest enclosing Group's order
 * first, so a mark is over the names only if its group is ordered above them.
 * Every layer that builds marks today puts its group at 190 or above, through
 * drawAboveSurfaceLayers (200) or the geopolitical registry (190–192). This pins
 * it, so a new layer of marks cannot land under the names by being forgotten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCREEN_POINTS_RENDER_ORDER } from '../screenPoints';

const ROOT = path.resolve(__dirname, '../../../..');
/** Where marks are built: the builders themselves are not callers. */
const BUILDERS = new Set([
  'src/components/Globe/screenPoints.ts',
  'src/components/Globe/intelReportSprites.ts',
  'src/components/Globe/satellitePoints.ts',
  // Its count badges ride on the glyphs of the layer that declutters, in that layer's group.
  'src/components/Globe/glyphDeclutter.ts',
]);
/** The names' order, and the least a group of marks may have over them. */
const COUNTRY_NAMES_ORDER = 130;
const LEAST_MARK_GROUP_ORDER = 150;

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const next = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(next);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(next);
      }
    }
  };
  walk(dir);
  return out;
}

describe('the marks a person clicks draw over the country names', () => {
  const callers = ['src/components', 'src/hooks', 'src/geopolitical', 'src/features']
    .flatMap(sources)
    .filter((file) => !BUILDERS.has(file))
    .filter((file) => /\b(buildScreenPoints|buildGlyphSprites|buildPlaceBadges)\(/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));

  it('finds the layers that build marks', () => {
    expect(callers.length).toBeGreaterThan(8);
  });

  it('puts every one of them in a group ordered above the names', () => {
    expect(SCREEN_POINTS_RENDER_ORDER).toBeGreaterThanOrEqual(LEAST_MARK_GROUP_ORDER);
    expect(LEAST_MARK_GROUP_ORDER).toBeGreaterThan(COUNTRY_NAMES_ORDER);
    for (const file of callers) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (/drawAboveSurfaceLayers\(/.test(source)) continue;
      const order = /layerOrder:\s*(\d+)/.exec(source);
      expect(order, `${file}: draws marks in no group ordered above the names`).not.toBeNull();
      expect(Number(order![1]), file).toBeGreaterThanOrEqual(LEAST_MARK_GROUP_ORDER);
    }
  });
});
