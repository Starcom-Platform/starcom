/**
 * ZSP 2.0: the whole globe in Terrae and Maria, Zones and Sectors (decision D-ZR), read as the globe reads it. The
 * files are the test partition (testPartition.ts), made by the rules of Mecha Jono's handoff and never shipped.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  bboxOf, childrenOf, containerFrom, editionOf, indexFrom, labelOf, loadZones, manifestEntriesFrom, placeAt,
  placesForCode, resetZonesForTests, retiredFrom, servedPlace, zoneFrom, ZONES_FOLDER,
} from '../zsp';
import { box, containerDoc, testPartition } from './testPartition';
import { pointInGeometry } from '../../../services/geoint/pointInPolygon';

const { manifest, files } = testPartition();
const docs = Object.values(files).map((text) => JSON.parse(text));
const index = indexFrom(manifest, docs);

describe('a ZSP 2.0 manifest', () => {
  it('is read as 2.0, its entries the Terrae and Maria', () => {
    expect(editionOf(manifest)).toBe('2.0');
    expect(manifestEntriesFrom(manifest).map((e) => e.id)).toEqual(['terra:borea', 'mare:austra']);
  });

  it('passes over an entry whose id is not a Terra or a Mare, or whose file is not a ZSP file', () => {
    const odd = { ...manifest, containers: [
      { id: 'zone:sahel', file: 'sahel.zsp.geojson', sha256: 'x' },
      { id: 'terra:borea', file: '../borea.json', sha256: 'x' },
      { id: 'mare:austra', file: 'mare-austra.zsp.geojson', sha256: 'x' },
    ] };
    expect(manifestEntriesFrom(odd).map((e) => e.id)).toEqual(['mare:austra']);
  });

  it('lists each retired 1.0 Zone with the Zones that now cover it (ZR8)', () => {
    expect(retiredFrom(manifest)).toEqual([{ id: 'zone:sahel', name: 'Sahel Zone', coveredBy: ['zone:borea-west', 'zone:borea-east'] }]);
    expect(retiredFrom({ zsp: '1.0', retired: [{ id: 'zone:sahel' }] })).toEqual([]);
  });
});

describe('a ZSP 2.0 file', () => {
  it('reads its container, its two Zones and their four Sectors, nothing unread', () => {
    const borea = containerFrom(docs[0])!;
    expect(borea.root).toMatchObject({ id: 'terra:borea', level: 'terra', parent: null, container: 'terra:borea' });
    expect(borea.zones.map((z) => z.root.id)).toEqual(['zone:borea-west', 'zone:borea-east']);
    expect(borea.zones[0].sectors.map((s) => s.id)).toEqual(['zone:borea-west/sector:low', 'zone:borea-west/sector:high']);
    expect(borea.unread).toBe(0);
    const sector = borea.zones[0].sectors[0];
    expect(sector).toMatchObject({ zone: 'zone:borea-west', container: 'terra:borea', precision: 'approximate', system: undefined });
    expect(sector.edges).toEqual([{ follows: 'grid', name: 'the test grid', source: undefined }]);
    expect(borea.zones[0].root.system).toBe('shield');
  });

  it('reads a Sector\'s IAU descriptor, and passes over a word that is not one', () => {
    const doc = containerDoc({ id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 }) as { features: Array<{ properties: Record<string, unknown> }> };
    doc.features.find((f) => f.properties.id === 'zone:borea-west/sector:low')!.properties.descriptor = 'Chasma';
    doc.features.find((f) => f.properties.id === 'zone:borea-west/sector:high')!.properties.descriptor = 'Gorge';
    const read = containerFrom(doc)!;
    expect(read.zones[0].sectors.map((s) => s.descriptor)).toEqual(['Chasma', undefined]);
  });

  it('reads the Maria\'s words: edges along an ocean front or the continental margin, and an island arc (ZR18)', () => {
    const doc = containerDoc({ id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 }) as { features: Array<{ properties: Record<string, unknown> }> };
    const low = doc.features.find((f) => f.properties.id === 'zone:borea-west/sector:low')!.properties;
    low.edges = [{ follows: 'front', name: 'the Polar Front' }, { follows: 'margin' }, { follows: 'coast' }];
    low.descriptor = 'Arcus';
    const sector = containerFrom(doc)!.zones[0].sectors[0];
    expect(sector.edges?.map((e) => e.follows)).toEqual(['front', 'margin']);
    expect(sector.descriptor).toBe('Arcus');
  });

  it('serves only what it reads: a Sector with Mecha Jono\'s extra fields reads the same trimmed (ZR27)', () => {
    const doc = containerDoc({ id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 }) as { features: Array<{ properties: Record<string, unknown> }> };
    const low = doc.features.find((f) => f.properties.id === 'zone:borea-west/sector:low')!.properties;
    // Every field the reader reads, given a value, and the extras their manifest carries.
    Object.assign(low, {
      principle: 'p', system: 'basin', state: 's', boundary: 'defined', character: 'c', terrain: ['t'], hazards: ['h'],
      resources: ['r'], landmarks: ['l'], countries: ['xx'], plates: ['Antarctic Plate'], ecoregions: ['e'],
      size_reason: 'small', descriptor: 'Planitia', area_km2: 102100, label: { lat: 10, lon: 20 }, bbox: [0, 0, 90, 45],
      sources: [{ name: 'ETOPO 2022', url: 'https://doi.org/10.25921/fd45-gt74', for: 'depths', licence: 'CC0-1.0' }],
      edges: [{ follows: 'plate', name: 'Aleutian Trench', source: 'Hasterok et al. 2022', neighbour: 'zone:x/sector:y', length_km: 675.8, follows_intended: 'margin' }],
      eqsp: 'c07-041', descriptor_basis: 'the abyssal plain', system_note: 'n', bounded_by: 'W: the Ross Gyre Zone', ages: 'Fixed',
    });
    const trimmed = { ...doc, features: doc.features.map((f) => ({ ...f, properties: servedPlace(f.properties) })) };
    expect(containerFrom(trimmed)).toEqual(containerFrom(doc));
    const served = trimmed.features.find((f) => f.properties.id === 'zone:borea-west/sector:low')!.properties;
    expect(Object.keys(served)).not.toContain('eqsp');
    expect(Object.keys(served)).not.toContain('bounded_by');
    expect(served.edges).toEqual([{ follows: 'plate', name: 'Aleutian Trench', source: 'Hasterok et al. 2022' }]);
  });

  it('works out a place\'s box and its label from the geometry when the file leaves them out', () => {
    const sector = index.byId.get('zone:borea-east/sector:low')!;
    expect(sector.bbox).toEqual([0, 0, 180, 45]);
    expect(sector.label.lon).toBeCloseTo(90, 6);
    expect(sector.label.lat).toBeCloseTo(22.5, 6);
    expect(bboxOf({ type: 'Polygon', coordinates: [box(10, 20, 30, 40)] })).toEqual([10, 20, 30, 40]);
    expect(labelOf({ type: 'Polygon', coordinates: [box(10, 20, 30, 40)] })).toEqual({ lon: 20, lat: 30 });
  });

  it('puts a bent place\'s label inside it, never on its neighbour', () => {
    // A U open to the north: its centre, (5, 4.1), lies in the gap between its arms, as 56 of 2.0's Sectors' did.
    const u = { type: 'Polygon' as const, coordinates: [[[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10], [0, 0]]] };
    const at = labelOf(u);
    expect(pointInGeometry(at.lat, at.lon, u)).toBe(true);
  });

  it('counts what breaks its level\'s rules as unread, never as a place', () => {
    const doc = containerDoc({ id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 }) as { features: Array<{ properties: Record<string, unknown> }> };
    const ring = box(0, 0, 10, 10);
    const bad = (properties: Record<string, unknown>) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } });
    doc.features.push(
      bad({ id: 'zone:elsewhere', name: 'In another container', level: 'zone', parent: 'mare:austra' }),
      bad({ id: 'zone:missing/sector:a', name: 'Its Zone is not in the file', level: 'sector', parent: 'zone:missing' }),
      bad({ id: 'zone:borea-west/sector:b', name: 'Its parent is not its Zone', level: 'sector', parent: 'zone:borea-east' }),
      bad({ id: 'Sector B', name: 'Not an id', level: 'sector', parent: 'zone:borea-west' }),
      bad({ id: 'zone:borea-west/sector:c', name: 'A level 2.0 does not have', level: 'sub-sector', parent: 'zone:borea-west' }),
    );
    const read = containerFrom(doc)!;
    expect(read.unread).toBe(5);
    expect(read.zones.flatMap((z) => z.places).map((p) => p.id)).not.toContain('zone:missing/sector:a');
  });

  it('is no container without its own outline, and each edition reads only its own files', () => {
    const doc = containerDoc({ id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 }) as { features: unknown[] };
    expect(containerFrom({ ...doc, features: doc.features.slice(1) })).toBeNull();
    expect(containerFrom({ ...doc, container: 'zone:borea-west' })).toBeNull();
    expect(containerFrom({ ...doc, zsp: '1.0' })).toBeNull();
    expect(zoneFrom(doc)).toBeNull();
  });
});

describe('the 2.0 index', () => {
  it('holds every container, Zone and Sector by id, and each container\'s Zones are its children', () => {
    expect(index.edition).toBe('2.0');
    expect(index.containers.map((c) => c.root.id)).toEqual(['terra:borea', 'mare:austra']);
    expect(index.zones).toHaveLength(4);
    expect(index.byId.size).toBe(2 + 4 + 8);
    expect(childrenOf(index, 'mare:austra').map((p) => p.id)).toEqual(['zone:austra-west', 'zone:austra-east']);
    expect(childrenOf(index, 'zone:austra-west').map((p) => p.id)).toEqual(['zone:austra-west/sector:low', 'zone:austra-west/sector:high']);
  });

  it('finds the Sector a point lies in, anywhere on the globe', () => {
    expect(placeAt(index, 60, -30)?.id).toBe('zone:borea-west/sector:high');
    expect(placeAt(index, -10, 100)?.id).toBe('zone:austra-east/sector:high');
    expect(placeAt(index, -89, 179)?.id).toBe('zone:austra-east/sector:low');
  });

  it('a report naming a retired Zone finds the Zones that now cover it; an unknown code finds nothing', () => {
    expect(placesForCode(index, 'zone:sahel').map((p) => p.id)).toEqual(['zone:borea-west', 'zone:borea-east']);
    expect(placesForCode(index, 'zone:borea-east/sector:low').map((p) => p.id)).toEqual(['zone:borea-east/sector:low']);
    expect(placesForCode(index, 'zone:atlantis')).toEqual([]);
  });
});

describe('loadZones, served 2.0', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetZonesForTests(); });

  it('asks for each container\'s file by its hash and reads the partition', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(url);
      const name = url.replace(`${ZONES_FOLDER}/`, '').split('?')[0];
      const body = name === 'manifest.json' ? manifest : JSON.parse(files[name]);
      return { ok: true, json: async () => body };
    }));
    const loaded = await loadZones();
    expect(loaded?.edition).toBe('2.0');
    expect(loaded?.containers).toHaveLength(2);
    const entries = manifestEntriesFrom(manifest);
    expect(asked.slice(1)).toEqual(entries.map((e) => `${ZONES_FOLDER}/${e.file}?v=${e.sha256.slice(0, 12)}`));
  });
});
