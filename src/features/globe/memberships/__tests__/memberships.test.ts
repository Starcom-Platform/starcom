/**
 * Mecha Jono's Spheres and Organisations lists, read as Starcom reads them (decision D-ZR, ZR10): cited members by
 * ISO code, a status and a date for each member of an Organisation, and what breaks the shape counted, never drawn.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { drawnMembers, drawnSphereMembers, organisationsFrom, spheresFrom } from '../memberships';

const spheres = {
  lists: '1.0', licence: 'CC-BY-4.0',
  spheres: [
    {
      id: 'sphere:anglosphere', name: 'Anglosphere', family: 'language', read: '2026-10-26',
      sources: [{ name: 'A cited list', url: 'https://example.org/list', licence: 'CC-BY-4.0' }],
      members: [{ code: 'GB', source: 'https://example.org/gb' }, { code: 'us' }, { code: 'England' }],
      groups: [{ id: 'core', name: 'Its core', members: ['gb', 'us', 'fr'] }],
    },
    { id: 'sphere:nowhere', name: 'No members', family: 'language', members: [] },
    { id: 'Anglosphere', name: 'Not an id', family: 'language', members: [{ code: 'gb' }] },
    { id: 'sphere:odd', name: 'An unknown family', family: 'religion', members: [{ code: 'va' }] },
  ],
};

const organisations = {
  lists: '1.0',
  organisations: [
    {
      id: 'union:brics', name: 'BRICS', kind: 'bloc', founded: '2009-06-16', read: '2026-10-26',
      members: [
        { code: 'br', status: 'member', since: '2009', source: 'https://example.org/brics' },
        { code: 'ru', status: 'member', since: '2009' },
        { code: 'by', status: 'partner', since: '2025-01-01' },
        { code: 'xx', status: 'founder' },
      ],
    },
    { id: 'union:brics', name: 'BRICS again', kind: 'bloc', members: [{ code: 'in', status: 'member' }] },
    { id: 'union:club', name: 'An unknown kind', kind: 'club', members: [{ code: 'fr', status: 'member' }] },
  ],
};

describe('spheresFrom', () => {
  it('reads a Sphere\'s members by code, lower case, each with its source, and its groups of members only', () => {
    const read = spheresFrom(spheres)!;
    expect(read.items).toHaveLength(1);
    const [anglo] = read.items;
    expect(anglo).toMatchObject({ id: 'sphere:anglosphere', family: 'language', read: '2026-10-26' });
    expect(anglo.members).toEqual([{ code: 'gb', source: 'https://example.org/gb' }, { code: 'us', source: undefined }]);
    expect(anglo.groups).toEqual([{ id: 'core', name: 'Its core', members: ['gb', 'us'] }]);
    expect(read.licence).toBe('CC-BY-4.0');
  });

  it('counts a Sphere with no members, no proper id or an unknown family as unread', () => {
    expect(spheresFrom(spheres)!.unread).toBe(3);
  });

  it('is not a list without its edition', () => {
    expect(spheresFrom({ spheres: spheres.spheres })).toBeNull();
    expect(spheresFrom({ lists: '2.0', spheres: [] })).toBeNull();
  });
});

describe('Part 2: "the", a note, and members listed but not drawn', () => {
  const part2 = {
    lists: '1.0',
    spheres: [{
      id: 'sphere:francophonie', name: 'Francophonie', the: true, family: 'language', note: 'Its associates are listed, not drawn.',
      members: [{ code: 'fr' }, { code: 'be' }, { code: 'ae', drawn: false }, { code: 'ca', drawn: true }],
      groups: [{ id: 'associates', name: 'Associate members', members: ['ae'], drawn: false }],
    }],
    organisations: [{ id: 'union:eu', name: 'European Union', the: true, kind: 'union', note: 'The candidates are listed, not drawn.', members: [{ code: 'de', status: 'member' }] }],
  };

  it('reads a Sphere\'s "the" and note, and which of its members are listed but not drawn', () => {
    const [sphere] = spheresFrom(part2)!.items;
    expect(sphere).toMatchObject({ the: true, note: 'Its associates are listed, not drawn.' });
    expect(sphere.members.map((m) => `${m.code}${m.drawn === false ? ' listed' : ''}`)).toEqual(['fr', 'be', 'ae listed', 'ca']);
    expect(drawnSphereMembers(sphere)).toEqual(['fr', 'be', 'ca']);
  });

  it('reads an Organisation\'s "the" and note', () => {
    expect(organisationsFrom(part2)!.items[0]).toMatchObject({ the: true, note: 'The candidates are listed, not drawn.' });
  });

  it('takes "the" only when it is true, and a note only when it says something', () => {
    const plain = { lists: '1.0', organisations: [{ id: 'union:brics', name: 'BRICS', the: 'yes', note: ' ', kind: 'bloc', members: [{ code: 'br', status: 'member' }] }] };
    const [brics] = organisationsFrom(plain)!.items;
    expect(brics.the).toBeUndefined();
    expect(brics.note).toBeUndefined();
  });
});

describe('organisationsFrom', () => {
  it('reads each member with its status and date, and drops a status it does not know', () => {
    const read = organisationsFrom(organisations)!;
    const [brics] = read.items;
    expect(brics.members.map((m) => `${m.code}:${m.status}`)).toEqual(['br:member', 'ru:member', 'by:partner']);
    expect(brics).toMatchObject({ kind: 'bloc', founded: '2009-06-16' });
  });

  it('keeps the first of two with one id, and counts the second and an unknown kind as unread', () => {
    const read = organisationsFrom(organisations)!;
    expect(read.items.map((o) => o.name)).toEqual(['BRICS']);
    expect(read.unread).toBe(2);
  });

  it('reads a potential candidate, as the EU names Kosovo, apart from a candidate and never drawn', () => {
    const eu = organisationsFrom({ lists: '1.0', organisations: [{ id: 'union:eu', name: 'European Union', kind: 'union', members: [
      { code: 'de', status: 'member' }, { code: 'xk', status: 'potential-candidate' }, { code: 'ua', status: 'candidate', since: '2022-06' },
    ] }] })!.items[0];
    expect(eu.members.map((m) => `${m.code}:${m.status}`)).toEqual(['de:member', 'xk:potential-candidate', 'ua:candidate']);
    expect(drawnMembers(eu)).toEqual(['de']);
  });

  it('draws an Organisation over its members only, never its partners', () => {
    expect(drawnMembers(organisationsFrom(organisations)!.items[0])).toEqual(['br', 'ru']);
  });
});
