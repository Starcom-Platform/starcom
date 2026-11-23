/**
 * The Zones layer's state, and the reports a Zone or a Sector finds (ZSP 1.0).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { zoneFrom, type ZspZone } from '../../../../geopolitical/zones/zsp';
import { reportsAbout, isPlacedOrNamed } from '../zoneReports';
import { getZonesState, resetZonesStoreForTests, selectZonePlace, setZoneHover, setZonesOn, toggleZones } from '../zonesStore';

const ROOT = resolve(__dirname, '../../../../..');
// A 1.0 document as served until the swap (geopolitical/zones/__tests__/zsp-1.0).
const rift = zoneFrom(JSON.parse(readFileSync(resolve(ROOT, 'src/geopolitical/zones/__tests__/zsp-1.0/east-african-rift.zsp.geojson'), 'utf8'))) as ZspZone;
const sector = (slug: string) => rift.sectors.find((s) => s.id.endsWith(`/sector:${slug}`))!;

const report = (id: string, at: Partial<IntelReportUI>, created = '2026-10-01T00:00:00Z'): IntelReportUI =>
  ({ id, title: id, createdAt: new Date(created), ...at }) as IntelReportUI;

describe('reportsAbout', () => {
  const reports = [
    report('in-afar', { latitude: 13.6, longitude: 40.67 }, '2026-10-02T00:00:00Z'),
    report('in-virunga', { latitude: -1.52, longitude: 29.25 }),
    report('names-afar', { jurisdictions: ['ZONE:East-African-Rift/sector:afar-triangle'] }, '2026-10-05T00:00:00Z'),
    report('names-zone', { jurisdictions: ['zone:east-african-rift'] }),
    report('in-victoria', { latitude: -1.0, longitude: 33.0 }),
    report('names-ethiopia', { jurisdictions: ['et'] }),
  ];

  it('a Sector finds the reports placed inside it and those naming it, newest first', () => {
    expect(reportsAbout(sector('afar-triangle'), reports).map((r) => [r.report.id, r.how])).toEqual([
      ['names-afar', 'named'], ['in-afar', 'inside'],
    ]);
  });

  it('a Zone finds those naming it or any Sector in it, and those placed anywhere inside it', () => {
    expect(reportsAbout(rift.root, reports).map((r) => r.report.id).sort()).toEqual(['in-afar', 'in-virunga', 'names-afar', 'names-zone']);
  });

  it('a Zone finds the reports naming a first Zone retired into it, and its Sectors of it (D-ZR)', () => {
    const named = [report('names-sahel', { jurisdictions: ['zone:sahel'] }), report('names-sahel-sector', { jurisdictions: ['zone:sahel/sector:x'] })];
    expect(reportsAbout(rift.root, named, ['zone:sahel']).map((r) => [r.report.id, r.how])).toEqual([
      ['names-sahel', 'named'], ['names-sahel-sector', 'named'],
    ]);
    expect(reportsAbout(rift.root, named)).toEqual([]);
  });

  it('a report naming the Zone alone is not about any one Sector of it', () => {
    expect(reportsAbout(sector('albertine-rift-north'), reports).map((r) => r.report.id)).toEqual(['in-virunga']);
  });

  it('only reports with a point or a jurisdiction are read', () => {
    expect(isPlacedOrNamed(report('nowhere', {}))).toBe(false);
    expect(isPlacedOrNamed(report('named', { jurisdictions: ['ke'] }))).toBe(true);
  });
});

describe('zonesStore', () => {
  beforeEach(() => { resetZonesStoreForTests(); localStorage.clear(); });

  it('remembers on or off in this browser', () => {
    setZonesOn(true);
    expect(localStorage.getItem('starcom-zones-layer')).toBe('on');
    toggleZones();
    expect(getZonesState().on).toBe(false);
    expect(localStorage.getItem('starcom-zones-layer')).toBe('off');
  });

  it('opening a place turns the layer on; turning it off closes the panel and the hover', () => {
    selectZonePlace(rift.root.id);
    expect(getZonesState()).toMatchObject({ on: true, selected: rift.root.id });
    setZoneHover({ id: rift.sectors[0].id, x: 10, y: 20 });
    setZonesOn(false);
    expect(getZonesState()).toMatchObject({ on: false, selected: null, hovered: null });
  });

  it('a hover that has not moved changes nothing', () => {
    setZoneHover({ id: 'a', x: 1, y: 2 });
    const before = getZonesState();
    setZoneHover({ id: 'a', x: 1, y: 2 });
    expect(getZonesState()).toBe(before);
  });
});
