/**
 * Share handle v29, as published: areas (BA16–BA18; plan block J, item 6). A
 * report naming a continent, union, sphere or zone in its jurisdiction tag is
 * listed, featured and grouped as a territory is. `listAreas()` lists every
 * area a report can name, what it is made of, and where that was taken from
 * and when; the contract lists the codes too, to plan by without a page.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { shareAreas } from '../shareAreas';
import { AREAS } from '../../areas/areaRegistry';

describe('contract v29', () => {
  it('is at version 29', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(29);
  });

  it('lists every area a report can name, by code, kind and name, and the bare codes read as one', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.listAreas).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.listAreas).toEqual(['code', 'kind', 'name', 'members', 'source', 'note']);
    expect(SHARE_HANDLE_CONTRACT.areas.map((a) => a.code)).toEqual(AREAS.map((a) => a.code));
    expect(SHARE_HANDLE_CONTRACT.areas[0]).toEqual({ code: 'continent:africa', kind: 'continent', name: 'Africa' });
    expect(SHARE_HANDLE_CONTRACT.areaAliases).toEqual({ eu: 'union:eu' });
  });
});

describe('listAreas()', () => {
  it('a union with its members, where they were taken from and when, and what to know of them', () => {
    const eu = shareAreas().find((a) => a.code === 'union:eu')!;
    expect(eu).toMatchObject({ code: 'union:eu', kind: 'union', name: 'European Union' });
    expect(eu.members).toHaveLength(27);
    expect(eu.members).toContain('fr');
    expect(eu.source).toEqual({ name: 'European Union: EU countries (both pages of the list)', url: 'https://european-union.europa.eu/principles-countries-history/eu-countries_en', read: '2026-10-23' });
    expect(eu.note).toMatch(/Northern Cyprus/);
  });

  it('no members for a continent, which is the map\'s own, or a zone Starcom drew, and a note on each', () => {
    const byCode = new Map(shareAreas().map((a) => [a.code, a]));
    expect(byCode.get('continent:europe')?.members).toBeNull();
    expect(byCode.get('continent:europe')?.note).toMatch(/Urals/);
    expect(byCode.get('zone:sahel')?.members).toBeNull();
    // Retired at the swap (ZR8), the Sahel says which Zones now hold it; the Horn of Africa is a 2.0 Zone, not countries.
    expect(byCode.get('zone:sahel')?.note).toMatch(/^Retired from the first Zones; now 6 Zones/);
    expect(byCode.get('zone:horn-of-africa')?.members).toBeNull();
    expect(byCode.get('union:mercosur')?.members).not.toContain('ve');
  });

  it('every area once, in the registry\'s order', () => {
    expect(shareAreas().map((a) => a.code)).toEqual(AREAS.map((a) => a.code));
  });

  it('copies, so a caller that edits what it was given cannot edit the next answer', () => {
    const first = shareAreas();
    first[7].members!.push('zz');
    first[7].source.read = 'never';
    const again = shareAreas();
    expect(again[7].members).not.toContain('zz');
    expect(again[7].source.read).toBe(AREAS[7].source.read);
    expect(again[7].source.read).not.toBe('never');
  });
});
