/**
 * Names as published (decision D-NP) along every path a note takes: each desk's reader keeps the publisher's own
 * `t=names_people`, and remembers the note's words; a card or a clip leaves the note out (NP2); a mission carrying
 * its words is refused (NP5); IntelWeb never ties the tagged notes together as a group of their own.
 *
 * From the kept notes each desk's own tests read, with the tag added, as Mecha Jono will add it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readWarConflictNote, type ConflictItem } from '../../warConflict/warConflict';
import { readRaverWatchNote, unreadKindOf, type RaverWatchItem } from '../../raverWatch/raverWatch';
import { readAiWatchNote, type AiWatchItem } from '../../aiWatch/aiWatch';
import { readFieldMission, type FieldMission } from '../../heroWatch/heroWatch';
import { missionsByPlace } from '../../heroWatch/heroWatchMissions';
import { warConflictBrief } from '../../warConflict/warConflictBrief';
import { warConflictShareReports, featuredWarConflictFor } from '../../../features/globe/capture/warConflictReports';
import { raverWatchShareReports, featuredRaverWatchFor } from '../../../features/globe/capture/raverWatchReports';
import { listShareReports, featuredReportFor } from '../../../features/globe/capture/shareReports';
import { intelStructure } from '../../intelweb/intelStructure';
import { intelReportUIToReportData } from '../../intelweb/IntelWebIntegrationService';
import { carriesNamedWords, NAMES_PEOPLE_TAG } from '../namesPeople';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import type { ReportPlace } from '../../../components/Globe/reportPlaces';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions');
const json = (path: string) => JSON.parse(readFileSync(resolve(KEPT, path), 'utf8'));
const tagged = (event: Event): Event => ({ ...event, tags: [...event.tags, ['t', NAMES_PEOPLE_TAG]] });
const POINT = { lat: 31.5, lon: 34.4 };
const noRegion = () => null;

const conflictEvent = (): Event => {
  const found = (json('war-conflict/conflict_vectors_3_5.json') as Array<{ family: string; event: Partial<Event> }>).find((v) => v.family === 'conflict_note')!;
  return { id: 'e'.repeat(64), sig: 's'.repeat(128), pubkey: MECHA, created_at: 1_790_967_291, ...found.event } as Event;
};
const raverEvent = (): Event => ({ id: 'e'.repeat(64), sig: 's'.repeat(128), created_at: 1_790_600_000, ...json('raver-watch/raver_watch_note.cfsre.example.json') } as Event);
const aiEvent = (): Event => (json('ai-watch/terminator_watch_live_2026-10-12.json') as Event[])[0];
const fieldEvent = (): Event => (json('hero-watch/hero_watch_live_2026-10-10.json') as Event[])
  .find((e) => e.kind === 30079 && e.tags.some((t) => t[0] === 'd' && t[1].startsWith('starcom_mission_package_field-naloxone-NM')))!;

describe('each desk\'s reader', () => {
  it('keeps the tag, and remembers the note\'s words, only when the publisher set it', () => {
    const conflict = readWarConflictNote(conflictEvent()) as ConflictItem;
    expect(conflict.namesPeople).toBeUndefined();
    expect(carriesNamedWords(`A mission: ${conflict.title}`)).toBeNull();

    const named = readWarConflictNote(tagged(conflictEvent())) as ConflictItem;
    expect(named.namesPeople).toBe(true);
    expect(carriesNamedWords(`A mission: ${conflict.title}`)).not.toBeNull();

    expect((readRaverWatchNote(tagged(raverEvent())) as RaverWatchItem).namesPeople).toBe(true);
    expect((readRaverWatchNote(raverEvent()) as RaverWatchItem).namesPeople).toBeUndefined();
    expect((readAiWatchNote(tagged(aiEvent())) as AiWatchItem).namesPeople).toBe(true);
  });

  it('never takes names_people for a kind of note no layer reads', () => {
    const odd = { ...raverEvent(), tags: [['t', 'raver_watch'], ['t', NAMES_PEOPLE_TAG], ['t', 'brand_new_kind']] } as Event;
    expect(unreadKindOf(odd)).toBe('brand_new_kind');
  });
});

describe('a card or a clip (NP2)', () => {
  it('leaves a War & Conflict note that names a person out of the list, the featured block and the brief\'s headline', () => {
    const plain = { ...(readWarConflictNote(conflictEvent()) as ConflictItem), point: POINT };
    const named = { ...(readWarConflictNote(tagged(conflictEvent())) as ConflictItem), id: 'named', point: POINT };
    expect(warConflictShareReports([plain, named], noRegion).map((r) => r.id)).toEqual([plain.id]);
    expect(featuredWarConflictFor(plain, noRegion, () => null)).not.toBeNull();
    expect(featuredWarConflictFor(named, noRegion, () => null)).toBeNull();

    // In the app the brief names the most serious note; on a card it never quotes one naming a person.
    const onlyNamed = [named];
    expect(warConflictBrief(onlyNamed, [])?.theatres[0]?.mostSerious?.id).toBe('named');
    const forCard = warConflictBrief(onlyNamed, [], undefined, { capture: true })!;
    expect(forCard.theatres[0].mostSerious).toBeUndefined();
    expect(forCard.theatres[0].count).toBe(1);
  });

  it('leaves a Raver Watch note naming a person out, though the layer shows it (NP3)', () => {
    const plain = { ...(readRaverWatchNote(raverEvent()) as RaverWatchItem), point: POINT };
    const named = { ...(readRaverWatchNote(tagged(raverEvent())) as RaverWatchItem), id: 'named', point: POINT };
    expect(raverWatchShareReports([plain, named], noRegion).map((r) => r.id)).toEqual([plain.id]);
    expect(featuredRaverWatchFor(named, noRegion)).toBeNull();
  });

  it('leaves an Intel Report naming a person out of the place\'s list and the featured block', () => {
    const marker = (pubkey: string, namesPeople?: boolean): IntelReportOverlayMarker => ({
      pubkey, title: `Report ${pubkey}`, content: '', tags: ['nostr'], latitude: 10, longitude: 20,
      timestamp: Date.parse('2026-10-24T00:00:00Z'), author: MECHA, kind: 'intel', ...(namesPeople ? { namesPeople } : {}),
    } as IntelReportOverlayMarker);
    const place = { kind: 'intel', latitude: 10, longitude: 20, reports: [marker('a'), marker('b', true)] } as unknown as ReportPlace;
    expect(listShareReports([place]).map((r) => r.id)).toEqual(['a']);
    expect(featuredReportFor(marker('a'))).not.toBeNull();
    expect(featuredReportFor(marker('b', true))).toBeNull();
  });
});

describe('a mission (NP5)', () => {
  it('is refused when it carries a tagged note\'s words, at reading and again where open missions are placed', () => {
    const mission = readFieldMission(fieldEvent()) as FieldMission;
    expect('refused' in mission).toBe(false);
    // A tagged note quoting the mission's own name arrives after it.
    readWarConflictNote(tagged({ ...conflictEvent(), tags: [...conflictEvent().tags.filter((t) => t[0] !== 'title'), ['title', mission.title]] }));
    expect(missionsByPlace([mission], () => ({ name: 'New Mexico' })).places).toEqual([]);
    expect(readFieldMission(fieldEvent())).toMatchObject({ refused: expect.stringMatching(/names no one/) });
  });
});

describe('IntelWeb', () => {
  const report = (id: string, hashtags: string[]): IntelReportUI => ({
    id, title: id, content: '', author: MECHA, category: 'GEOINT', tags: ['nostr'], hashtags,
    createdAt: new Date('2026-10-24T00:00:00Z'), updatedAt: new Date('2026-10-24T00:00:00Z'),
  } as IntelReportUI);

  it('never ties the notes that name people together as a hub', () => {
    const reports = [report('a', ['starcom_intel', NAMES_PEOPLE_TAG]), report('b', ['starcom_intel', NAMES_PEOPLE_TAG]), report('c', ['x']), report('d', ['x']), report('e', ['y'])];
    const hubs = intelStructure(reports).hubs.filter((h) => h.kind === 'tag').map((h) => h.key);
    expect(hubs).toContain('x');
    expect(hubs).not.toContain(NAMES_PEOPLE_TAG);
  });

  it('hands the label what it needs: the flag and the sources', () => {
    const data = intelReportUIToReportData({ ...report('a', []), namesPeople: true, sourceLinks: ['https://www.reuters.com/x'] });
    expect(data).toMatchObject({ namesPeople: true, sourceLinks: ['https://www.reuters.com/x'] });
  });
});
