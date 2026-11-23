/**
 * The plate boundaries beside the quakes (D-EQ, EQ8): PB2002 as baked (public/data/quakes/plate-boundaries.json),
 * read once, drawn with the subduction zones apart.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlateBoundaries, isPlatesFile, loadPlateBoundaries, PLATE_COLOURS, resetPlatesForTests } from '../quakePlates';
import { batchedLines } from '../../../../geopolitical/geometry/lineBatches';

const baked = JSON.parse(readFileSync('public/data/quakes/plate-boundaries.json', 'utf8'));

describe('the plate boundaries', () => {
  afterEach(() => resetPlatesForTests());

  it("are PB2002's, as baked: every boundary between two named plates, the subduction zones marked", () => {
    expect(isPlatesFile(baked)).toBe(true);
    expect(baked.boundaries).toHaveLength(241);
    expect(baked.boundaries.filter((b: { subduction: boolean }) => b.subduction)).toHaveLength(65);
    expect(baked.boundaries.every((b: { plates: string[] }) => b.plates.every((p) => p.length > 2))).toBe(true);
    expect(baked.credit).toMatch(/Bird, P\. \(2003\)/);
  });

  it('draw the subduction zones in their own colour, each line named for its plates', () => {
    const group = buildPlateBoundaries(baked, { type: 'plates' });
    const lines = batchedLines(group);
    expect(lines).toHaveLength(241);
    const subduction = lines.filter((l) => l.color === parseInt(PLATE_COLOURS.subduction.slice(1), 16));
    expect(subduction).toHaveLength(65);
    expect(subduction[0].tooltip).toMatch(/^A subduction zone between the \w[\w ]+ and \w[\w ]+ plates \(PB2002\)$/);
  });

  it('are read once, and again only after a failure', async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => baked }) as Response);
    await loadPlateBoundaries(ok);
    await loadPlateBoundaries(ok);
    expect(ok).toHaveBeenCalledTimes(1);
    resetPlatesForTests();
    const failing = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response);
    expect(await loadPlateBoundaries(failing)).toBeNull();
    expect(await loadPlateBoundaries(failing)).toBeNull();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
