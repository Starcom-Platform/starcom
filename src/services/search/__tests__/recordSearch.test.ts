/**
 * Search that finds records (plan item 1.4, story S24): the header's search
 * found apps, commands and countries, never a case, mission or report, so
 * typing a mission's name with the mission saved found nothing.
 */
import { describe, it, expect } from 'vitest';
import { searchRecords, type SearchableRecords } from '../recordSearch';

const records: SearchableRecords = {
  reports: [
    { id: 'intel-1', title: 'Berth 4 cranes at night', content: 'Three of them working after 02:00 near Vessel K.', tags: ['port'] },
    { id: 'intel-2', title: 'Pantry closed at noon', content: 'Sign on the door: closed until further notice.', tags: [] },
    { id: 'intel-3', title: 'Old sample report', content: 'Demo material.', tags: [], sample: true },
  ],
  cases: [
    { id: 'intelcase-1', caseNumber: 'CASE-2026-77QX-B342', title: 'Night loading at berth 4', description: 'Is berth 4 loading at night?', tags: [] },
  ],
  missions: [
    { id: 'mission-1', missionNumber: 'MSN-2026-A3JV-998A', title: 'Watch berth 4', briefing: 'Photograph the cranes after 02:00, and count the cranes working.', tags: [] },
  ],
};

describe('searching records', () => {
  it('finds a case, a mission and a report by what they are called', () => {
    expect(searchRecords('watch berth', records).map((h) => h.id)).toEqual(['mission-1']);
    expect(searchRecords('night loading', records).map((h) => h.id)).toContain('intelcase-1');
    expect(searchRecords('pantry', records).map((h) => [h.kind, h.id])).toEqual([['report', 'intel-2']]);
  });

  it('finds a record by its number, whole or in part', () => {
    expect(searchRecords('CASE-2026-77QX-B342', records).map((h) => h.id)).toEqual(['intelcase-1']);
    expect(searchRecords('77QX', records).map((h) => h.id)).toEqual(['intelcase-1']);
    expect(searchRecords('msn-2026-a3jv', records).map((h) => h.id)).toEqual(['mission-1']);
  });

  it('finds as it is typed: the last word matches by its start', () => {
    // The report says all three in its title; the mission mentions cranes in its briefing.
    expect(searchRecords('berth 4 cra', records).map((h) => h.id)).toEqual(['intel-1', 'mission-1']);
    expect(searchRecords('pan', records).map((h) => h.id)).toEqual(['intel-2']);
  });

  it('needs every word, and puts what a record is called above what it merely mentions', () => {
    const hits = searchRecords('berth', records).map((h) => h.id);
    expect(hits).toEqual(expect.arrayContaining(['intelcase-1', 'mission-1', 'intel-1']));
    expect(searchRecords('berth pantry', records)).toEqual([]);
    const cranes = searchRecords('cranes', records).map((h) => h.id);
    // Named once in the report's title; mentioned twice in the mission's briefing.
    expect(cranes[0]).toBe('intel-1');
    expect(cranes).toContain('mission-1');
  });

  it('says what each hit is, with its number, and marks sample material', () => {
    expect(searchRecords('77qx', records)[0]).toMatchObject({ kind: 'case', title: 'Night loading at berth 4', number: 'CASE-2026-77QX-B342' });
    expect(searchRecords('sample', records)[0]).toMatchObject({ id: 'intel-3', sample: true });
  });

  it('finds nothing for nothing typed', () => {
    expect(searchRecords('   ', records)).toEqual([]);
  });
});

describe('searching records, as the review found it wrong', () => {
  const ciphertext = JSON.stringify({ __classifiedEncrypted: true, ciphertext: [12, 34, 4], iv: [1, 2], metadata: { v: 1 } });
  const withSecrets: SearchableRecords = {
    reports: [{ id: 'intel-secret', title: 'Berth 9 visitor log', content: ciphertext, tags: [] }],
    cases: [{ id: 'intelcase-secret', title: 'Night meetings', description: ciphertext, tags: [] }],
    missions: [{ id: 'mission-cyr', title: 'Киев station watch', briefing: '', tags: [] }],
  };

  it('does not search a protected record\'s ciphertext, only what can be read', () => {
    expect(searchRecords('12', withSecrets)).toEqual([]);
    expect(searchRecords('iv', withSecrets)).toEqual([]);
    expect(searchRecords('visitor', withSecrets).map((h) => h.id)).toEqual(['intel-secret']);
  });

  it('finds nothing for a query with no words in it, rather than everything', () => {
    expect(searchRecords('-', withSecrets)).toEqual([]);
    expect(searchRecords('#(', withSecrets)).toEqual([]);
  });

  it('finds a name that is not written in Latin letters', () => {
    expect(searchRecords('Киев', withSecrets).map((h) => h.id)).toEqual(['mission-cyr']);
  });

  it('copes with a word that starts thousands of others', () => {
    const many: SearchableRecords = { reports: [{ id: 'big', title: 'Big', content: Array.from({ length: 150_000 }, (_, i) => `a${i}`).join(' '), tags: [] }], cases: [], missions: [] };
    expect(() => searchRecords('a', many)).not.toThrow();
    expect(searchRecords('a', many).map((h) => h.id)).toEqual(['big']);
  });
});
