/**
 * What links IntelWeb's notes (decision D-IW: IW1, IW5–IW7): only what a note
 * states. Its countries; the tags and publishers it shares with others, where
 * they group; the notes it cites or names; the mission packages it names.
 *
 * The real half runs the 460 notes read from The Record on 2026-10-13 through
 * the intel intake itself, so what is tested is what IntelWeb is given.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { intelStructure, type StructureReport } from '../intelStructure';
import { nostrStarcomIntelIngest } from '../../intel/NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const MJ = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const note = (id: string, over: Partial<StructureReport> = {}): StructureReport => ({ id, author: MJ, ...over });
const hubKeys = (s: ReturnType<typeof intelStructure>, kind: string) => s.hubs.filter((h) => h.kind === kind).map((h) => h.key).sort();

describe('hubs: what notes have in common, where it groups (IW5)', () => {
  it('a country each note states, even one only one note states', () => {
    const s = intelStructure([note('a', { jurisdictions: ['ye'] }), note('b', { jurisdictions: ['ye', 'sa'] }), note('c')]);
    expect(s.hubs.filter((h) => h.kind === 'country').map((h) => [h.key, h.members])).toEqual([['sa', ['b']], ['ye', ['a', 'b']]]);
  });

  it('a tag on at least two notes and at most half of them', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((id) => note(id, {
      hashtags: [
        'everywhere',
        ...(Number(id) <= 4 ? ['four'] : []),
        ...(Number(id) <= 3 ? ['half'] : []),
        ...(Number(id) <= 2 ? ['two'] : []),
        ...(id === '1' ? ['one'] : []),
      ],
    }));
    expect(hubKeys(intelStructure(six), 'tag')).toEqual(['half', 'two']);
  });

  it('a tag stated twice by one note is one note\'s', () => {
    const s = intelStructure([note('a', { hashtags: ['x', 'x'] }), note('b'), note('c'), note('d')]);
    expect(hubKeys(s, 'tag')).toEqual([]);
  });

  it('no publisher hub where one publisher wrote them all', () => {
    expect(hubKeys(intelStructure([note('a'), note('b'), note('c'), note('d')]), 'publisher')).toEqual([]);
  });

  it('a publisher hub under the same rule where several wrote them', () => {
    const s = intelStructure([note('a'), note('b'), note('c', { author: 'x' }), note('d', { author: 'x' })]);
    expect(hubKeys(s, 'publisher')).toEqual([MJ, 'x']);
  });
});

describe('links: what a note names (IW1, IW7)', () => {
  const held = `30023:${MJ}:held`;
  const away = `30023:${MJ}:away`;
  const grant = `30079:${MJ}:ic-grant-1`;
  const field = `30079:${MJ}:field-1`;

  it('a note it names that is held here is a link; one that is not, a stub that says so', () => {
    const s = intelStructure([note(held), note('b', { refers: [held, away] })]);
    expect(s.links).toEqual([{ from: 'b', to: held, why: 'refers' }, { from: 'b', to: away, why: 'refers' }]);
    expect(s.targets).toEqual([{ id: away, kind: 'report', held: false }]);
  });

  it('a mission package it names is a node, named where held, a stub where not', () => {
    const named = (address: string) => (address === field ? 'Flood relief, Bahia' : null);
    const s = intelStructure([note('a', { refers: [grant, field] }), note('b', { refers: [grant] })], { missionTitle: named });
    expect(s.targets).toEqual([
      { id: grant, kind: 'mission', held: false },
      { id: field, kind: 'mission', held: true, title: 'Flood relief, Bahia' },
    ]);
    expect(s.links.filter((l) => l.to === grant).map((l) => l.from)).toEqual(['a', 'b']);
  });

  it('a citation of a held note is a link, and of anything else a stub', () => {
    const id = 'f'.repeat(64);
    const other = 'e'.repeat(64);
    const s = intelStructure([note(id), note('b', { cites: [{ eventId: id }, { eventId: other }] })]);
    expect(s.links).toEqual([{ from: 'b', to: id, why: 'cites' }, { from: 'b', to: other, why: 'cites' }]);
    expect(s.targets).toEqual([{ id: other, kind: 'report', held: false }]);
  });

  it('linked intel that is a held note is a link; other intel a stub', () => {
    const s = intelStructure([note('a'), note('b', { sourceIntelIds: ['a', 'intel-9'] })]);
    expect(s.links).toEqual([{ from: 'b', to: 'a', why: 'linked-intel' }, { from: 'b', to: 'intel-9', why: 'linked-intel' }]);
    expect(s.targets).toEqual([{ id: 'intel-9', kind: 'intel', held: false }]);
  });

  it('never a link from a note to itself, and each link once', () => {
    const s = intelStructure([note(held, { refers: [held] }), note('c', { refers: [held, held] })]);
    expect(s.links).toEqual([{ from: 'c', to: held, why: 'refers' }]);
  });
});

describe('the notes on The Record, through the intake', () => {
  type Raw = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };
  const SAMPLE: { events: Raw[] } = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/intelweb/starcom_intel_record_2026-10-13.json'), 'utf8'));
  let reports: IntelReportUI[] = [];
  let s: ReturnType<typeof intelStructure>;

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
    reports = [...new Map(reports.map((r) => [r.id, r])).values()];
    s = intelStructure(reports);
  });

  it('reads the notes, each with the notes and packages it names', () => {
    expect(reports.length).toBeGreaterThan(400);
    // Counted from the raw tags: every note with an `a` tag naming a note or a package.
    const naming = SAMPLE.events.filter((e) => e.tags.some((t) => t[0] === 'a' && /^(?:30023|30079):/.test(t[1]))).map((e) => e.id);
    expect(naming).toHaveLength(88);
    expect(reports.filter((r) => r.refers?.length)).toHaveLength(88);
  });

  it('makes no hub of what nearly every note carries, nor of the one publisher', () => {
    const tags = hubKeys(s, 'tag');
    for (const everywhere of ['starcom_intel', 'intel_report', 'role:context', 'category:conflict']) expect(tags).not.toContain(everywhere);
    expect(tags).toContain('war_map');
    expect(hubKeys(s, 'publisher')).toEqual([]);
  });

  it('finds every note a note names among the notes held', () => {
    const named = s.links.filter((l) => l.why === 'refers' && l.to.startsWith('30023:'));
    expect(named.length).toBeGreaterThan(50);
    expect(s.targets.filter((t) => t.kind === 'report')).toEqual([]);
  });

  it('names the mission packages as stubs, none being held here', () => {
    const missions = s.targets.filter((t) => t.kind === 'mission');
    expect(missions.length).toBeGreaterThan(0);
    expect(missions.every((m) => !m.held)).toBe(true);
  });

  it('leaves no note out of every group', () => {
    expect(s.unjoined).toEqual([]);
  });
});
