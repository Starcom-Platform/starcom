/**
 * Spheres and Organisations from Mecha Jono's lists, merged over the areas Starcom codes (decision D-ZR, ZR10; CR6):
 * listed Spheres stand in for the coded ones, a listed body replaces the coded one with its code, and with no list
 * nothing changes.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { AREAS, type AreaDef } from '../areaRegistry';
import { listedAreasFrom, mergeListed } from '../listedAreas';

const spheres = {
  lists: '1.0', generated: '2026-10-26T00:00:00Z',
  spheres: [{ id: 'sphere:anglosphere', name: 'Anglosphere', family: 'language', members: [{ code: 'gb' }, { code: 'us' }, { code: 'ie' }], sources: [{ name: 'A list', url: 'https://example.org/a' }] }],
};
const organisations = {
  lists: '1.0', generated: '2026-10-26T00:00:00Z',
  organisations: [
    { id: 'union:eu', name: 'European Union', kind: 'union', read: '2026-10-25', members: [{ code: 'de', status: 'member' }, { code: 'fr', status: 'member' }, { code: 'ua', status: 'candidate', since: '2022-06-23' }] },
    { id: 'union:brics', name: 'BRICS', kind: 'bloc', members: [{ code: 'br', status: 'member' }, { code: 'by', status: 'partner' }] },
  ],
};

describe('listedAreasFrom', () => {
  const listed = listedAreasFrom(spheres, organisations);

  it('makes each listed Sphere an area of its members, its family in the registry\'s word', () => {
    expect(listed.spheres).toEqual([{
      code: 'sphere:anglosphere', kind: 'sphere', influence: 'semantic', name: 'Anglosphere', from: 'members',
      members: ['gb', 'us', 'ie'], source: { name: 'A list', url: 'https://example.org/a', read: '2026-10-26' },
    }]);
  });

  it('draws a body over its members only, and keeps the rest with their status and day', () => {
    const eu = listed.unions.find((u) => u.code === 'union:eu')!;
    expect(eu).toMatchObject({ kind: 'union', from: 'members', members: ['de', 'fr'], others: [{ code: 'ua', status: 'candidate', since: '2022-06-23' }] });
    expect(eu.source.read).toBe('2026-10-25');
    expect(listed.unions.find((u) => u.code === 'union:brics')!.others).toEqual([{ code: 'by', status: 'partner' }]);
  });

  it('draws a Sphere over the members it draws, lists the rest, and keeps its "the" and note (Part 2)', () => {
    const part2 = listedAreasFrom({
      lists: '1.0', generated: '2026-10-26T00:00:00Z',
      spheres: [{ id: 'sphere:francophonie', name: 'Francophonie', the: true, family: 'language', note: 'Associates listed, not drawn.', members: [{ code: 'fr' }, { code: 'ae', drawn: false }] }],
    }, {
      lists: '1.0', organisations: [{ id: 'union:eu', name: 'European Union', the: true, kind: 'union', note: 'Candidates listed, not drawn.', members: [{ code: 'de', status: 'member' }] }],
    });
    expect(part2.spheres[0]).toMatchObject({ the: true, note: 'Associates listed, not drawn.', members: ['fr'], others: [{ code: 'ae', status: 'listed' }] });
    expect(part2.unions[0]).toMatchObject({ the: true, note: 'Candidates listed, not drawn.' });
    expect(listed.spheres[0]).not.toHaveProperty('others');
  });

  it('adds nothing for a list that is not there', () => {
    expect(listedAreasFrom(null, null)).toEqual({ spheres: [], unions: [] });
  });
});

describe('mergeListed', () => {
  it('changes nothing while nothing is listed: the registry holds the coded areas as they were', () => {
    expect(mergeListed(AREAS, { spheres: [], unions: [] })).toEqual([...AREAS]);
  });

  it('puts listed Spheres in place of every coded one, a listed body over its code, and a new body beside them', () => {
    const merged = mergeListed(AREAS, listedAreasFrom(spheres, organisations));
    const spheresNow = merged.filter((a) => a.kind === 'sphere');
    expect(spheresNow.map((a) => a.code)).toEqual(['sphere:anglosphere']);
    const eu = merged.find((a) => a.code === 'union:eu') as AreaDef & { members: string[] };
    expect(eu.members).toEqual(['de', 'fr']);
    expect(merged.filter((a) => a.code === 'union:eu')).toHaveLength(1);
    expect(merged.some((a) => a.code === 'union:brics')).toBe(true);
    expect(merged.some((a) => a.code === 'union:asean')).toBe(true);
    expect(merged.filter((a) => a.kind === 'zone').length).toBe(AREAS.filter((a) => a.kind === 'zone').length);
  });
});
