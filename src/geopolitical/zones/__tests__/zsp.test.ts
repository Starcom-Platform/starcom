/**
 * Zones, with Sectors inside the Zones (ZSP 1.0): the documents as served, read
 * as the globe reads them, and the point lookup the panel and the search lean on.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canonUrl, childrenOf, licenceUrl, loadZones, manifestEntriesFrom, placeAt, resetZonesForTests, zoneFrom, zoneIndexOf,
  ZONES_FOLDER, type ZspZone,
} from '../zsp';

const ROOT = resolve(__dirname, '../../../..');
// The 1.0 documents as served until the swap, kept beside these tests (zsp-1.0/README.md).
const FOLDER = resolve(__dirname, 'zsp-1.0');
const manifest = JSON.parse(readFileSync(resolve(FOLDER, 'manifest.json'), 'utf8'));
const rawRift = readFileSync(resolve(FOLDER, 'east-african-rift.zsp.geojson'));
const rift = zoneFrom(JSON.parse(rawRift.toString('utf8'))) as ZspZone;
const index = zoneIndexOf([rift]);

describe('the served Zones', () => {
  it('lists every document by the hash of its bytes, so a changed Zone is fetched afresh', () => {
    const entries = manifestEntriesFrom(manifest);
    expect(entries.map((e) => e.id)).toContain('zone:east-african-rift');
    for (const entry of entries) {
      const bytes = readFileSync(resolve(FOLDER, entry.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });

  it('each document is already in the form the build serves it in, so its hash is true of what is served', () => {
    // scripts/minify-dist-json.mjs rewrites every JSON file in dist/ as JSON.stringify writes it.
    for (const entry of manifestEntriesFrom(manifest)) {
      const text = readFileSync(resolve(FOLDER, entry.file), 'utf8');
      expect(JSON.stringify(JSON.parse(text)), entry.file).toBe(text);
    }
  });

  it('reads the East African Rift Zone whole: the Zone, eight Sectors, nothing unread', () => {
    expect(rift.root.id).toBe('zone:east-african-rift');
    expect(rift.root.zoneClass).toBe('anchor');
    expect(rift.root.frame).toBe('geological');
    expect(rift.sectors.map((s) => s.name)).toEqual([
      'Afar Triangle', 'Main Ethiopian Rift', 'Turkana Depression', 'Kenyan Gregory Rift', 'North Tanzanian Divergence',
      'Albertine Rift North', 'Central Western Rift', 'Southern Rift',
    ]);
    expect(rift.unread).toBe(0);
    for (const s of rift.sectors) {
      expect(s.id.startsWith('zone:east-african-rift/sector:')).toBe(true);
      expect(s.parent).toBe(rift.root.id);
      expect(s.precision).toBe('approximate');
      expect(s.landmarks.length).toBeGreaterThanOrEqual(2);
    }
    expect(childrenOf(index, rift.root.id)).toHaveLength(8);
  });
});

describe('placeAt: the innermost place a point lies in', () => {
  // Points the protocol's own checks hold to (Mecha Jono's beu/zones.py, `where`).
  it.each([
    ['Nyiragongo', -1.52, 29.25, 'Albertine Rift North'],
    ['Lake Kivu', -2.05, 29.15, 'Central Western Rift'],
    ['Erta Ale', 13.6, 40.67, 'Afar Triangle'],
    ['Kilimanjaro', -3.07, 37.35, 'North Tanzanian Divergence'],
  ])('%s is in the %s', (_name, lat, lon, sector) => {
    expect(placeAt(index, lat, lon)?.name).toBe(sector);
  });

  it('a point between the branches, in Lake Victoria, is in no Zone', () => {
    expect(placeAt(index, -1.0, 33.0)).toBeNull();
  });

  it('every landmark lies in its own Sector', () => {
    const doc = JSON.parse(rawRift.toString('utf8'));
    for (const f of doc.features.filter((x: { properties: { level: string } }) => x.properties.level === 'sector')) {
      for (const [name, at] of Object.entries(f.properties.landmark_points as Record<string, { lat: number; lon: number }>)) {
        expect(placeAt(index, at.lat, at.lon)?.id, name).toBe(f.properties.id);
      }
    }
  });
});

describe('zoneFrom refuses what is not a ZSP document', () => {
  const doc = () => JSON.parse(rawRift.toString('utf8'));
  it('no version, or a top that is not the Zone named', () => {
    expect(zoneFrom({ ...doc(), zsp: undefined })).toBeNull();
    expect(zoneFrom({ ...doc(), zone: 'zone:somewhere-else' })).toBeNull();
    expect(zoneFrom(null)).toBeNull();
  });

  it('counts a feature it cannot read rather than dropping it unsaid', () => {
    const d = doc();
    d.features[3].geometry = { type: 'Point', coordinates: [0, 0] };
    d.features[4].properties.precision = 'exact';
    const z = zoneFrom(d) as ZspZone;
    expect(z.unread).toBe(2);
    expect(z.sectors).toHaveLength(6);
  });

  it('reads a Sub-Sector and a Nested Zone by the schema\'s own levels', () => {
    const d = doc();
    const afar = d.features.find((f: { properties: { id: string } }) => f.properties.id.endsWith('sector:afar-triangle'));
    const sub = { ...afar, properties: { ...afar.properties, id: `${afar.properties.id}/sub:erta-ale`, level: 'sub-sector', parent: afar.properties.id } };
    const nested = { ...afar, properties: { ...afar.properties, id: `${afar.properties.id}/zone:lava-field`, level: 'zone', class: 'nested', parent: afar.properties.id } };
    d.features.push(sub, nested);
    const z = zoneFrom(d) as ZspZone;
    expect(z.unread).toBe(0);
    const idx = zoneIndexOf([z]);
    expect(idx.byId.get(sub.properties.id)?.level).toBe('sub-sector');
    expect(idx.byId.get(nested.properties.id)?.zoneClass).toBe('nested');
    expect(z.root.id).toBe('zone:east-african-rift');
  });

  it('a manifest entry naming anything but a ZSP file in the folder is passed over', () => {
    expect(manifestEntriesFrom({ zsp: '1.0', zones: [{ id: 'zone:x', file: '../secrets.json', sha256: 'ab' }] })).toEqual([]);
    expect(manifestEntriesFrom({ zones: manifest.zones })).toEqual([]);
  });
});

describe('loadZones', () => {
  afterEach(() => { resetZonesForTests(); vi.unstubAllGlobals(); });
  /** The served folder, as a fetch: the manifest, or the document a URL names. */
  const served = async (url: string) => {
    const file = url.split('/').pop()!.split('?')[0];
    return { ok: true, json: async () => JSON.parse(readFileSync(resolve(FOLDER, file), 'utf8')) } as Response;
  };

  it('asks for each document by its hash, and reads it', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { asked.push(url); return served(url); }));
    const loaded = await loadZones();
    expect(loaded?.zones.map((z) => z.root.id)).toEqual(manifest.zones.map((z: { id: string }) => z.id));
    expect(loaded?.zones.every((z) => z.unread === 0)).toBe(true);
    const rift = manifest.zones.find((z: { id: string }) => z.id === 'zone:east-african-rift');
    expect(asked).toContain(`${ZONES_FOLDER}/east-african-rift.zsp.geojson?v=${rift.sha256.slice(0, 12)}`);
  });

  it('says it could not, and lets the next caller try again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as Response));
    expect(await loadZones()).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(served));
    expect((await loadZones())?.zones).toHaveLength(manifest.zones.length);
  });
});

it('a place with a wiki page links to it', () => {
  expect(canonUrl(rift.root)).toBe('https://wiki.fusiongirl.app/wiki/East_African_Rift_Zone');
});

describe('licences', () => {
  it('a Creative Commons id is linked to its deed; anything else is not', () => {
    expect(licenceUrl('CC-BY-SA-4.0')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(licenceUrl('CC-BY-4.0')).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(licenceUrl('IBGE open data')).toBeNull();
    expect(licenceUrl(undefined)).toBeNull();
  });

  it('a document\'s own licence and each source\'s are read', () => {
    const d = JSON.parse(rawRift.toString('utf8'));
    d.licence = 'CC-BY-SA-4.0';
    d.features[1].properties.sources = [{ name: 'FAO', url: 'https://fao.example/a', licence: 'CC BY-SA 4.0', for: 'the extent' }];
    const z = zoneFrom(d) as ZspZone;
    expect(z.licence).toBe('CC-BY-SA-4.0');
    expect(z.sectors[0].sources[0]).toEqual({ name: 'FAO', url: 'https://fao.example/a', licence: 'CC BY-SA 4.0', for: 'the extent' });
  });
});
