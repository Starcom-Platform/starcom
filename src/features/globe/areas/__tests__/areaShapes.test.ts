/**
 * The areas' shapes as the app takes them (BA18): from Starcom's own file,
 * once, and only those areas this build defines.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { areaShapesFrom, areaShapesUrl, loadAreaShapes, resetAreaShapesForTests } from '../areaShapes';
import { AREAS, areaDefinitionsHash } from '../areaRegistry';

const PUBLIC = resolve(__dirname, '../../../../../public/geopolitical');
const file = readFileSync(resolve(PUBLIC, 'areas-lod0.geojson'), 'utf8');

afterEach(() => { resetAreaShapesForTests(); vi.unstubAllGlobals(); });

describe('the areas Starcom serves', () => {
  it('are every area this build defines, by its code, under the name it gives it', () => {
    const shapes = areaShapesFrom(JSON.parse(file));
    expect([...shapes.keys()]).toEqual(AREAS.map((a) => a.code));
    for (const area of AREAS) {
      expect(shapes.get(area.code)?.name).toBe(area.name);
      expect(['Polygon', 'MultiPolygon']).toContain(shapes.get(area.code)?.geometry.type);
    }
  });

  it('pass over a shape for an area this build does not define, and one that is not a shape', () => {
    const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const shapes = areaShapesFrom({
      features: [
        { properties: { code: 'union:no-such-body' }, geometry: square },
        { properties: { code: 'union:eu' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
        { properties: { code: 'union:gcc' } },
        { properties: {}, geometry: square },
        { properties: { code: 'zone:sahel' }, geometry: square },
      ],
    });
    expect([...shapes.keys()]).toEqual(['zone:sahel']);
    expect(shapes.get('zone:sahel')?.name).toBe('Sahel Zone');
  });

  it('are the bytes the manifest says they are', () => {
    const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.json'), 'utf8')) as { datasets: Array<{ file: string; sha256: string }> };
    const entry = manifest.datasets.find((d) => d.file === 'areas-lod0.geojson');
    expect(entry?.sha256).toBe(createHash('sha256').update(file).digest('hex'));
  });

  it('are fetched once, from Starcom itself, by the hash of the definitions, and a failed fetch is tried again', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(file, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadAreaShapes()).toBeUndefined();
    const shapes = await loadAreaShapes();
    await loadAreaShapes();
    expect(shapes?.size).toBe(AREAS.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(areaShapesUrl()).toBe(`/geopolitical/areas-lod0.geojson?v=${areaDefinitionsHash()}`);
    expect(String(fetchMock.mock.calls[1][0])).toBe(areaShapesUrl());
  });

  it('take a refusal from the server as a failure, tried again', async () => {
    const fetchMock = vi.fn()
      // A body that parses, so only the status can make it a failure.
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 404 }))
      .mockResolvedValue(new Response(file, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadAreaShapes()).toBeUndefined();
    expect((await loadAreaShapes())?.size).toBe(AREAS.length);
  });
});
