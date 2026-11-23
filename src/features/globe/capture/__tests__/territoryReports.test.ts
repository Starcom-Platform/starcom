/**
 * Intel Reports about a territory as a whole (BA3; plan block J, item 3).
 *
 * Of Mecha Jono's 193 notes since 2 October, 148 say where only by
 * jurisdiction: a country, or a US state. The globe outlined the countries and
 * could draw no state at all, and none could be listed or featured, so their
 * briefing could feature 1 of 5 highlights. Now each is listed and featured as
 * its territory: placed at the middle of its largest part, with how far it
 * reaches, its outline lit, and the card saying it is about the place as a
 * whole. Never a pin.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { usStatesFrom } from '../../../../services/raverWatch/usStates';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { territoryResolver, territoryShareReports, featuredTerritoryFor } from '../territoryReports';

const ROOT = resolve(__dirname, '../../../../..');
const TERRITORIES = buildTerritoryIndex(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features);
const STATES = usStatesFrom(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/us-states-50m.geojson'), 'utf8')));
const resolveBoth = territoryResolver(TERRITORIES, STATES);

const report = (id: string, jurisdictions: string[], over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id,
  title: `Report ${id}`,
  content: 'Four charities in Castle Rock lost their exemption.',
  summary: 'S',
  author: 'a'.repeat(64),
  category: 'intel',
  tags: [],
  hashtags: ['starcom_intel'],
  jurisdictions,
  createdAt: new Date('2026-10-02T12:00:00.000Z'),
  updatedAt: new Date('2026-10-02T12:00:00.000Z'),
  status: 'SUBMITTED',
  version: 1,
  history: [],
  ...over,
} as IntelReportUI);

describe('which territories this app can draw', () => {
  it('a US state from Starcom\'s own state lines, a country from the territory index, by code in any case', () => {
    expect(resolveBoth('us-oh')).toMatchObject({ code: 'us-oh', name: 'Ohio' });
    expect(resolveBoth('US-OH')).toMatchObject({ code: 'us-oh', name: 'Ohio' });
    expect(resolveBoth('de')).toMatchObject({ code: 'de', name: 'Germany' });
    expect(resolveBoth('us-zz')).toBeNull();
    expect(resolveBoth('not a code')).toBeNull();
  });

  it('no state without the state lines', () => {
    expect(territoryResolver(TERRITORIES, undefined)('us-oh')).toBeNull();
    expect(territoryResolver(TERRITORIES, undefined)('de')).toMatchObject({ name: 'Germany' });
  });
});

describe('listed for the share handle', () => {
  it('as its territory: at the middle of its largest part, with how far it reaches, named', () => {
    const [ohio] = territoryShareReports([report('r1', ['us-oh'])], resolveBoth);
    expect(ohio).toMatchObject({ id: 'r1', layer: 'IntelReports', title: 'Report r1', territories: [{ code: 'us-oh', name: 'Ohio' }] });
    expect(ohio.lat).toBeGreaterThan(38.5);
    expect(ohio.lat).toBeLessThan(42);
    expect(ohio.lng).toBeGreaterThan(-84.8);
    expect(ohio.lng).toBeLessThan(-80.5);
    // How far Ohio reaches from its middle: some 150 to 300 km.
    expect(ohio.precisionM).toBeGreaterThan(150_000);
    expect(ohio.precisionM).toBeLessThan(300_000);
    // Described as any Intel Report: unassessed, and by its author.
    expect(ohio.variant).toBe('raw');
    expect(ohio.author).toMatch(/^npub1/);
  });

  it('a report naming two territories, placed at the first it can draw, naming both', () => {
    const [both] = territoryShareReports([report('r2', ['ps', 'il'])], resolveBoth);
    expect(both.territories!.map((t) => t.code)).toEqual(['ps', 'il']);
    const [first] = territoryShareReports([report('r3', ['ps'])], resolveBoth);
    expect([both.lat, both.lng]).toEqual([first.lat, first.lng]);
  });

  it('stands at the first territory it names, wherever the others are', () => {
    const [far] = territoryShareReports([report('r4', ['de', 'us-oh'])], resolveBoth);
    // Germany's middle, not Ohio's.
    expect(far.lat).toBeGreaterThan(47);
    expect(far.lng).toBeGreaterThan(5);
    expect(far.territories!.map((t) => t.name)).toEqual(['Germany', 'Ohio']);
  });

  it('counts the others about the same territory, as reports at one place are counted', () => {
    const listed = territoryShareReports([report('a', ['us-oh']), report('b', ['us-oh']), report('c', ['de'])], resolveBoth);
    expect(listed.map((r) => r.sharesPlaceWith)).toEqual([1, 1, 0]);
  });

  it('not a report with a point of its own, which is drawn where it says, nor one naming nothing drawable', () => {
    expect(territoryShareReports([report('p', ['us-oh'], { latitude: 40, longitude: -83 })], resolveBoth)).toEqual([]);
    expect(territoryShareReports([report('q', ['bq', 'us-zz'])], resolveBoth)).toEqual([]);
    expect(territoryShareReports([report('s', [])], resolveBoth)).toEqual([]);
  });
});

describe('featured on a card', () => {
  it('says it is about the place as a whole, where an item with a point says how near', () => {
    const featured = featuredTerritoryFor(report('r1', ['us-oh']), resolveBoth)!;
    expect(featured.id).toBe('r1');
    expect(featured.lines).toContain('About Ohio as a whole: the report names no place in it');
    expect(featured.lines.some((line) => line.startsWith('Near '))).toBe(false);
    const [listed] = territoryShareReports([report('r1', ['us-oh'])], resolveBoth);
    expect(Math.abs(featured.position.lat - listed.lat)).toBeLessThan(1);
  });

  it('names every territory it is about', () => {
    expect(featuredTerritoryFor(report('r2', ['ps', 'il']), resolveBoth)!.lines)
      .toContain('About Palestine and Israel as a whole: the report names no place in them');
  });

  it('none for a report it cannot place', () => {
    // Bonaire: the map draws it inside the Netherlands.
    expect(featuredTerritoryFor(report('q', ['bq']), resolveBoth)).toBeNull();
  });

  it('French Guiana as a territory of its own (Mecha Jono, 7 Nov 2026): no longer inside France', () => {
    expect(featuredTerritoryFor(report('g', ['gf']), resolveBoth)!.lines).toContain('About French Guiana as a whole: the report names no place in it');
  });
});
