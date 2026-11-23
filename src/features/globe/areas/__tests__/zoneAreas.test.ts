/**
 * The Zones as areas, from the partition Starcom serves (decision D-ZR; the owner's rule CR6: nothing coded in).
 * Under ZSP 2.0 each Terra, Mare and Zone is an area a report names by its own id, its outline its document's; each
 * id the manifest retires stays an area, drawn as the Zones that cover it, so what named it still finds its place.
 * Under ZSP 1.0 nothing is listed; since the swap (ZR8) no Zone is coded in the registry.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { mergeZoneAreas, zoneAreasFrom } from '../zoneAreas';
import { testPartition } from '../../../../geopolitical/zones/__tests__/testPartition';
import type { AreaDef } from '../areaRegistry';

const { manifest, files } = testPartition();
const docOf = (file: string) => JSON.parse(files[file]);
const ZSP_1 = resolve(__dirname, '../../../../geopolitical/zones/__tests__/zsp-1.0');

describe('zoneAreasFrom', () => {
  it('lists each Terra, Mare and Zone of a 2.0 partition, its outline its container file\'s, by that file\'s hash', () => {
    const { zones } = zoneAreasFrom(manifest, docOf);
    expect(zones.map((a) => a.code)).toEqual([
      'terra:borea', 'zone:borea-west', 'zone:borea-east', 'mare:austra', 'zone:austra-west', 'zone:austra-east',
    ]);
    const entries = (manifest as { containers: Array<{ id: string; file: string; sha256: string }> }).containers;
    for (const area of zones) {
      expect(area).toMatchObject({ kind: area.code.split(':')[0], from: 'zsp' });
      const entry = entries.find((c) => area.code === c.id || area.code.includes(c.id.split(':')[1]))!;
      expect(area).toMatchObject({ file: entry.file, sha256: entry.sha256 });
      expect(area.source.read).toBe('2026-10-18');
      // Every area cites a page: the place's own, else the manifest served.
      expect(area.source.url).toMatch(/^https:\/\//);
    }
    expect(zones.find((a) => a.code === 'zone:borea-west')?.name).toBe('Terra Borea west Zone');
    // A Zone takes "the" in running text; a Terra or a Mare does not.
    expect(zones.filter((a) => a.the).map((a) => a.code)).toEqual(['zone:borea-west', 'zone:borea-east', 'zone:austra-west', 'zone:austra-east']);
  });

  it('keeps each retired id as an area drawn as the Zones that cover it', () => {
    const { retired } = zoneAreasFrom(manifest, docOf);
    expect(retired).toEqual([expect.objectContaining({
      code: 'zone:sahel', kind: 'zone', name: 'Sahel Zone', the: true, from: 'covered', coveredBy: ['zone:borea-west', 'zone:borea-east'],
      note: 'Retired from the first Zones; now the Terra Borea west Zone and the Terra Borea east Zone.',
    })]);
  });

  it('names up to four Zones covering a retired one, a name holding its own "and" kept apart by semicolons', () => {
    const covering = ['zone:borea-west', 'zone:borea-east', 'zone:austra-west', 'zone:austra-east'];
    const named = (coveredBy: string[]) => zoneAreasFrom({ ...manifest, retired: [{ id: 'zone:ring-of-fire', name: 'Pacific Ring of Fire Zone', covered_by: coveredBy }] }, docOf).retired[0].note;
    expect(named(covering)).toBe('Retired from the first Zones; now the Terra Borea west Zone, the Terra Borea east Zone, the Mare Austra west Zone and the Mare Austra east Zone.');
    const docs = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, JSON.parse(t.replace('"Terra Borea west Zone"', '"Shan Plateau and the Tenasserim Zone"'))]));
    const ownAnd = zoneAreasFrom({ ...manifest, retired: [{ id: 'zone:golden-triangle', name: 'Golden Triangle Zone', covered_by: covering.slice(0, 2) }] }, (f) => docs[f]).retired[0].note;
    expect(ownAnd).toBe('Retired from the first Zones; now the Shan Plateau and the Tenasserim Zone; and the Terra Borea east Zone.');
  });

  it('lists nothing for a 1.0 manifest, or none at all', () => {
    const oneManifest = JSON.parse(readFileSync(resolve(ZSP_1, 'manifest.json'), 'utf8'));
    expect(zoneAreasFrom(oneManifest, (f) => JSON.parse(readFileSync(resolve(ZSP_1, f), 'utf8')))).toEqual({ zones: [], retired: [] });
    expect(zoneAreasFrom(null, docOf)).toEqual({ zones: [], retired: [] });
  });
});

describe('mergeZoneAreas', () => {
  const coded = [
    { code: 'union:eu', kind: 'union', name: 'European Union', from: 'members', members: ['de'], source: { name: 's', url: '', read: '' } },
  ] as AreaDef[];

  it('puts the partition\'s Terrae, Maria and Zones after the coded areas, and its retired ids last', () => {
    const merged = mergeZoneAreas(coded, zoneAreasFrom(manifest, docOf));
    expect(merged.map((a) => a.code)).toEqual([
      'union:eu', 'terra:borea', 'zone:borea-west', 'zone:borea-east', 'mare:austra', 'zone:austra-west', 'zone:austra-east', 'zone:sahel',
    ]);
    expect(merged.find((a) => a.code === 'zone:sahel')?.from).toBe('covered');
  });

  it('changes nothing while no partition is listed', () => {
    expect(mergeZoneAreas(coded, { zones: [], retired: [] })).toEqual(coded);
  });
});
