/**
 * The checks a ZSP 2.0 partition passes before Starcom serves it (decision D-ZR, ZR9), on the whole-globe test
 * partition and on copies of it broken one way at a time.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { checkPartition, EARTH_KM2, selfIntersects } from '../zspChecks';
import { box, testPartition } from './testPartition';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** The test partition with one file's document changed, its hash and size in the manifest made to match. */
function broken(edit: (doc: { features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> }) => void, file = 'terra-borea.zsp.geojson') {
  const { manifest, files } = testPartition();
  const doc = JSON.parse(files[file]);
  edit(doc);
  files[file] = JSON.stringify(doc);
  for (const c of (manifest as { containers: Array<{ file: string; sha256: string; bytes: number }> }).containers) {
    if (c.file === file) { c.sha256 = sha256(files[file]); c.bytes = Buffer.byteLength(files[file], 'utf8'); }
  }
  return checkPartition(manifest, files, sha256);
}

const featureOf = (doc: { features: Array<{ properties: Record<string, unknown> }> }, id: string) => doc.features.find((f) => f.properties.id === id)!;

describe('checkPartition', () => {
  it('passes the whole-globe test partition: two containers, four Zones, eight Sectors, the Earth covered once', () => {
    const { manifest, files } = testPartition();
    const report = checkPartition(manifest, files, sha256);
    expect(report.problems).toEqual([]);
    expect(report).toMatchObject({ edition: '2.0', containers: 2, zones: 4, sectors: 8 });
    expect(Math.abs(report.coveredKm2 - EARTH_KM2) / EARTH_KM2).toBeLessThan(1e-6);
  });

  it('says what the set costs to load, and refuses one over the cap of 8 MB (ZR27)', async () => {
    const { PARTITION_MAX_BYTES } = await import('../zspChecks');
    const { manifest, files } = testPartition();
    const report = checkPartition(manifest, files, sha256);
    expect(report.bytes).toBe(Object.values(files).reduce((n, text) => n + Buffer.byteLength(text, 'utf8'), 0));
    expect(report.points).toBeGreaterThan(0);
    // The same partition, one file padded past the cap: still sound, too big to serve.
    const heavy = broken((doc) => { (doc as unknown as { padding: string }).padding = 'x'.repeat(PARTITION_MAX_BYTES); });
    expect(heavy.problems).toEqual([expect.stringMatching(/^size: the files come to [\d,]+ bytes, over the cap of 8,000,000/)]);
  });

  it('checks nothing while 1.0 is served, and says which edition it saw', () => {
    expect(checkPartition({ zsp: '1.0', zones: [] }, {}, sha256)).toMatchObject({ edition: '1.0', problems: [] });
  });

  it('refuses a missing Sector: the area falls short and its points are in no Sector', () => {
    const report = broken((doc) => { doc.features = doc.features.filter((f) => f.properties.id !== 'zone:borea-east/sector:high'); });
    expect(report.problems.some((p) => p.startsWith('coverage: the Sectors add up to'))).toBe(true);
    expect(report.problems.some((p) => /is in no Sector/.test(p))).toBe(true);
  });

  it('refuses two Sectors over one place', () => {
    const report = broken((doc) => { featureOf(doc, 'zone:borea-east/sector:low').geometry.coordinates = [box(-10, 0, 180, 45)]; });
    expect(report.problems.some((p) => / and zone:/.test(p))).toBe(true);
  });

  it('refuses a file whose hash is not the manifest\'s, and one the manifest names but the folder lacks', () => {
    const { manifest, files } = testPartition();
    const report = checkPartition(manifest, { 'terra-borea.zsp.geojson': `${files['terra-borea.zsp.geojson']} ` }, sha256);
    expect(report.problems).toContain('terra-borea.zsp.geojson: its hash is not the manifest\'s');
    expect(report.problems).toContain('mare-austra.zsp.geojson: named in the manifest, not in the folder');
  });

  it('refuses a size the manifest states in characters, not bytes (NavCom, 26 Oct)', () => {
    const { manifest, files } = testPartition();
    const entry = (manifest as { containers: Array<{ file: string; bytes: number }> }).containers[0];
    const real = entry.bytes;
    entry.bytes = real - 2;
    expect(checkPartition(manifest, files, sha256).problems).toContain(`${entry.file}: the manifest says ${real - 2} bytes, the file is ${real}`);
  });

  it('refuses a corner of the map that no Sector holds, where an edge cuts across the South Pole at the date line (NavCom, 26 Oct)', () => {
    const report = broken((doc) => {
      for (const f of doc.features) {
        if (f.properties.level !== 'sector') continue;
        const ring = (f.geometry.coordinates as number[][][])[0];
        const k = ring.findIndex(([x, y]) => x === -180 && y === -90);
        if (k < 0) continue;
        // The corner stepped across, as a simplified edge did: (-180, -89.9) then (-179.9, -90).
        const stepped = [[-180, -89.9], [-179.9, -90]];
        ring.splice(k, 1, ...(k === 0 ? stepped.slice().reverse() : stepped));
        if (k === 0) ring[ring.length - 1] = ring[0];
      }
    }, 'mare-austra.zsp.geojson');
    expect(report.problems.filter((p) => p.startsWith('coverage: the corner'))).toEqual(['coverage: the corner at -89.99, -179.99 is in no Sector']);
  });

  it('refuses a Sector out of size without its reason', () => {
    const report = broken((doc) => { delete featureOf(doc, 'zone:borea-west/sector:low').properties.size_reason; });
    expect(report.problems.some((p) => p.startsWith('zone:borea-west/sector:low:') && /outside 50,000–500,000, and no size_reason/.test(p))).toBe(true);
  });

  it('reads an IAU descriptor on a Sector, and refuses a word the IAU does not use', () => {
    expect(broken((doc) => { featureOf(doc, 'zone:borea-west/sector:low').properties.descriptor = 'Planitia'; }).problems).toEqual([]);
    const report = broken((doc) => { featureOf(doc, 'zone:borea-west/sector:low').properties.descriptor = 'Valley'; });
    expect(report.problems).toContain('zone:borea-west/sector:low: "Valley" is not one of the IAU\'s descriptor terms');
  });

  it('refuses a share-alike or non-commercial source, a source with no licence, and a partition licence that is not free', () => {
    const report = broken((doc) => {
      featureOf(doc, 'zone:borea-west/sector:low').properties.sources = [{ name: 'GEM Global Active Faults', licence: 'CC-BY-SA-4.0' }];
      featureOf(doc, 'zone:borea-west/sector:high').properties.sources = [{ name: 'An unnamed map' }];
    });
    expect(report.problems).toContain('zone:borea-west/sector:low: source "GEM Global Active Faults" is CC-BY-SA-4.0, which would bind the partition');
    expect(report.problems).toContain('zone:borea-west/sector:high: source "An unnamed map" states no licence');
    const { manifest, files } = testPartition();
    expect(checkPartition({ ...manifest, licence: 'CC-BY-NC-4.0' }, files, sha256).problems[0]).toMatch(/^manifest: the partition's licence is CC-BY-NC-4.0/);
  });

  it('refuses an outer ring wound clockwise, and one that is not closed', () => {
    const report = broken((doc) => {
      featureOf(doc, 'zone:borea-west/sector:low').geometry.coordinates = [box(-180, 0, 0, 45).reverse()];
      const ring = box(0, 0, 180, 45);
      featureOf(doc, 'zone:borea-east/sector:low').geometry.coordinates = [ring.slice(0, -1)];
    });
    expect(report.problems.some((p) => /zone:borea-west\/sector:low .*wound clockwise/.test(p))).toBe(true);
    expect(report.problems.some((p) => /zone:borea-east\/sector:low .*not a closed ring/.test(p))).toBe(true);
  });

  it('refuses a retired Zone said to be covered by a Zone the partition does not hold', () => {
    const { manifest, files } = testPartition();
    const report = checkPartition({ ...manifest, retired: [{ id: 'zone:levant', name: 'Levant Zone', covered_by: ['zone:atlantis'] }] }, files, sha256);
    expect(report.problems).toContain('retired zone:levant: covered by zone:atlantis, which the partition does not hold');
  });
});

describe('selfIntersects', () => {
  it('finds a ring that crosses itself, and passes one that does not', () => {
    expect(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]])).toBe(true);
    expect(selfIntersects(box(0, 0, 10, 10))).toBe(false);
    expect(selfIntersects(box(-180, -90, 180, 0))).toBe(false);
  });
});
