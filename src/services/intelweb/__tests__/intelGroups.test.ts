/**
 * How IntelWeb groups its notes (decision D-IW, IW8): by country, theatre and event, desk, source,
 * category, Zone, Sector or Sphere, each from what a note states. A note in several groups of the
 * kind chosen clusters in the largest; one in none, in a group that says so.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupNotes, notesOf, type GroupNote } from '../intelGroups';
import type { ZspPlace } from '../../../geopolitical/zones/zsp';
import { nostrStarcomIntelIngest } from '../../intel/NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const note = (id: string, over: Partial<GroupNote> = {}): GroupNote => ({ id, ...over });
const keys = (g: ReturnType<typeof groupNotes>) => g.groups.map((x) => [x.key, x.members]);
const none = { spheres: [], places: [] };

describe('grouping by what a note states', () => {
  it('by country: each country stated, a region counted as its country, an area code not a country', () => {
    const g = groupNotes([note('a', { jurisdictions: ['ye'] }), note('b', { jurisdictions: ['us-tx', 'zone:sahel'] }), note('c', { jurisdictions: ['us'] })], 'country', none);
    expect(keys(g)).toEqual([['us', ['b', 'c']], ['ye', ['a']]]);
  });

  it('by theatre and event, desk, source and category, from the tags of each kind', () => {
    const tags = ['theatre:sudan', 'event:airstrike', 'conflict_desk', 'source:un_news', 'category:conflict.events', 'role:context'];
    const notes = [note('a', { hashtags: tags }), note('b', { hashtags: ['category:conflict'] })];
    expect(keys(groupNotes(notes, 'theatre', none))).toEqual([['event:airstrike', ['a']], ['theatre:sudan', ['a']]]);
    expect(keys(groupNotes(notes, 'desk', none))).toEqual([['conflict_desk', ['a']]]);
    expect(keys(groupNotes(notes, 'source', none))).toEqual([['source:un_news', ['a']]]);
    // A category's subdivisions are the category.
    expect(keys(groupNotes(notes, 'category', none))).toEqual([['category:conflict', ['a', 'b']]]);
  });

  it('by Sphere: a note stating one of its members, or naming it', () => {
    const spheres = [{ code: 'sphere:arabophone', members: ['ye', 'sa'] }, { code: 'sphere:anglosphere', members: ['us', 'gb'] }];
    const g = groupNotes([note('a', { jurisdictions: ['ye'] }), note('b', { jurisdictions: ['sphere:anglosphere'] }), note('c', { jurisdictions: ['fr'] })], 'sphere', { spheres, places: [] });
    expect(keys(g)).toEqual([['sphere:anglosphere', ['b']], ['sphere:arabophone', ['a']]]);
    expect(g.ungrouped).toEqual(['c']);
  });

  it('by Zone or Sector: placed inside it or naming it, as the Zones layer finds its reports', () => {
    const square = (id: string, level: ZspPlace['level'], [w, s, e, n]: [number, number, number, number]): ZspPlace => ({
      id, name: id, level, parent: null, zone: 'zone:test', precision: 'approximate', terrain: [], hazards: [], resources: [], landmarks: [],
      countries: [], sources: [], label: { lat: (s + n) / 2, lon: (w + e) / 2 }, bbox: [w, s, e, n],
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    } as ZspPlace);
    const places = [square('zone:test', 'zone', [0, 0, 10, 10]), square('zone:test/sector:west', 'sector', [0, 0, 5, 10])];
    const notes = [note('in-west', { point: [5, 2] }), note('in-east', { point: [5, 8] }), note('named', { jurisdictions: ['zone:test/sector:west'] }), note('away', { point: [50, 50] })];
    expect(keys(groupNotes(notes, 'zone', { spheres: [], places }))).toEqual([['zone:test', ['in-west', 'in-east', 'named']]]);
    expect(keys(groupNotes(notes, 'sector', { spheres: [], places }))).toEqual([['zone:test/sector:west', ['in-west', 'named']]]);
  });
});

describe('clusters', () => {
  it('a note in several groups clusters in the largest, ties by name', () => {
    const g = groupNotes([
      note('a', { jurisdictions: ['ye', 'sa'] }), note('b', { jurisdictions: ['sa'] }), note('c', { jurisdictions: ['ye', 'om'] }), note('d', { jurisdictions: ['om'] }),
    ], 'country', none);
    expect(Object.fromEntries(g.clusterOf)).toEqual({ a: 'sa', b: 'sa', c: 'om', d: 'om' });
  });

  it('a note in no group is listed as such, and in no cluster', () => {
    const g = groupNotes([note('a', { jurisdictions: ['ye'] }), note('b')], 'country', none);
    expect(g.ungrouped).toEqual(['b']);
    expect(g.clusterOf.has('b')).toBe(false);
  });
});

describe('the notes on The Record, through the intake', () => {
  type Raw = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };
  const SAMPLE: { events: Raw[] } = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/intelweb/starcom_intel_record_2026-10-13.json'), 'utf8'));
  const reports: IntelReportUI[] = [];
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = nostrStarcomIntelIngest as any;
    svc.resetState();
    const off = nostrStarcomIntelIngest.subscribe((r) => reports.push(r));
    svc.active = true;
    try {
      for (const raw of SAMPLE.events) await svc.handleEvent(raw, 'wss://record.cosmiccodex.app');
    } finally {
      svc.active = false;
      off();
    }
  });

  it('groups nine in ten by country, and says which notes state none', () => {
    const notes = notesOf(reports);
    const g = groupNotes(notes, 'country', none);
    const placed = notes.filter((n) => (n.jurisdictions ?? []).some((j) => /^[a-z]{2}(-|$)/.test(j)));
    expect(g.clusterOf.size).toBe(placed.length);
    expect(g.clusterOf.size / notes.length).toBeGreaterThan(0.85);
    expect(g.ungrouped.length).toBe(notes.length - placed.length);
  });

  it('groups by desk from the desks Mecha Jono writes from', () => {
    const g = groupNotes(notesOf(reports), 'desk', none);
    expect(g.groups.map((x) => x.key)).toEqual(expect.arrayContaining(['conflict_desk', 'alert_desk']));
  });
});
