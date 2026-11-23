/**
 * The header search's Zones: baked from what is served, and read on their own, not with the whole partition.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { indexFrom, manifestEntriesFrom } from '../../../../geopolitical/zones/zsp';
import { loadZoneSearch, resetZoneSearchForTests, zoneSearchOf, ZONE_SEARCH_URL, type ZoneSearchFile } from '../zoneSearch';

const ROOT = path.resolve(__dirname, '../../../../..');
const FOLDER = path.join(ROOT, 'public/geopolitical/zones');
const served = () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(FOLDER, 'manifest.json'), 'utf8'));
  const docs = manifestEntriesFrom(manifest).map((e) => JSON.parse(fs.readFileSync(path.join(FOLDER, e.file), 'utf8')));
  return indexFrom(manifest, docs);
};
const baked = (): ZoneSearchFile => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', ZONE_SEARCH_URL), 'utf8'));

describe('zones-search.json', () => {
  it('is what the served Zones bake to (run `npm run bake:zone-search` when this fails)', () => {
    expect(baked()).toEqual(JSON.parse(JSON.stringify(zoneSearchOf(served()))));
  });

  it('holds every Zone and Sector the search offers, and every id, at a small part of the partition', () => {
    const index = served();
    const file = baked();
    expect(file.zones.map((z) => z.root.id)).toEqual(index.zones.map((z) => z.root.id));
    expect(file.zones.flatMap((z) => z.sectors.map((s) => s.id))).toEqual(index.zones.flatMap((z) => z.sectors.map((s) => s.id)));
    const listed = file.zones.flatMap((z) => [z.root.id, ...z.sectors.map((s) => s.id)]);
    expect(new Set([...listed, ...file.ids])).toEqual(new Set(index.byId.keys()));
    const bytes = fs.statSync(path.join(ROOT, 'public', ZONE_SEARCH_URL)).size;
    const partition = fs.readdirSync(FOLDER).reduce((n, name) => n + fs.statSync(path.join(FOLDER, name)).size, 0);
    expect(bytes).toBeLessThan(partition / 10);
  });
});

describe('loadZoneSearch', () => {
  afterEach(() => { resetZoneSearchForTests(); vi.unstubAllGlobals(); });

  it('fetches the baked file once, never a Zone file, and answers by id', async () => {
    const file = baked();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(file)));
    vi.stubGlobal('fetch', fetchMock);
    const search = await loadZoneSearch();
    await loadZoneSearch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ZONE_SEARCH_URL);
    expect(search?.zones.length).toBe(file.zones.length);
    expect(search?.byId.has(file.zones[0].root.id)).toBe(true);
    expect(search?.byId.has('zone:nowhere')).toBe(false);
  });

  it('answers null when the file cannot be read, and tries again the next time', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadZoneSearch()).toBeNull();
    expect(await loadZoneSearch()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
