/**
 * Hero Watch's intake (decision D-HW, step 1): Mecha Jono's notes of who is responding, and where,
 * and its field missions, read from The Record. Read here from the real events The Record held on
 * 10 October 2026 (hero_watch_live_2026-10-10.json beside the record), so each kind's fields are the
 * types they are sent as.
 */
import { describe, expect, it, vi } from 'vitest';
import { BURST_MS } from '../../nostr/burst';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import {
  HeroWatchStore, heroWatchItems, heroWatchStatus, readFieldMission, readHeroWatchNote, startHeroWatch, subscribeHeroWatch,
  type FieldMission, type HeroWatchItem,
} from '../heroWatch';
import { createRelayPool } from '../../nostr/relayPool';
import { MECHA_JONO_KEYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';

const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/hero-watch/hero_watch_live_2026-10-10.json'), 'utf8'));
const byD = (prefix: string) => LIVE.find((e) => e.tags.some((t) => t[0] === 'd' && t[1].startsWith(prefix)))!;
const read = (prefix: string) => {
  const e = byD(prefix);
  return (e.kind === 30079 ? readFieldMission(e) : readHeroWatchNote(e)) as HeroWatchItem;
};
const withTags = (event: Event, tags: string[][]): Event => ({ ...event, tags });
const without = (event: Event, name: string, value?: string): Event =>
  withTags(event, event.tags.filter((t) => !(t[0] === name && (value === undefined || t[1] === value))));

describe('reading Hero Watch\'s notes', () => {
  it('reads a lifeboat station: its point, kept as a public place is, and 2025\'s launches', () => {
    const station = read('hero-watch-station-4533');
    expect(station).toMatchObject({ kind: 'station', section: 'Lifeboats', jurisdiction: 'gb-eng', precision: 'venue', source: 'RNLI', year: 2025, stationType: expect.any(String) });
    expect(station.kind === 'station' && station.launches).toBeGreaterThan(0);
    expect(station.id).toBe(`30023:${MECHA}:hero-watch-station-4533`);
    // A public building, kept to 0.001°, as Raver Watch keeps a public venue (RW12).
    const raw = byD('hero-watch-station-4533').tags.find((t) => t[0] === 'geo')![1];
    const lat = Number(raw.match(/lat:([-0-9.]+)/)![1]);
    expect(station.point!.lat).toBe(Math.round(lat * 1000) / 1000);
  });

  it('reads a relief operation: its country, appeal, money, people and dates', () => {
    expect(read('hero-watch-appeal-')).toMatchObject({
      kind: 'operation', section: 'Relief', jurisdiction: 'et', appealType: 'DREF', amountChf: 749972, peopleToReach: 50000,
      start: 1790640000, end: 1806537600, source: 'IFRC GO',
    });
  });

  it('reads who is working where: organisations counted, never named, with the period and licence', () => {
    expect(read('hero-watch-presence-et')).toMatchObject({
      kind: 'presence', section: 'Relief', jurisdiction: 'et', organisations: 144, nationalNgos: 73,
      sectors: ['Protection', 'Food Security', 'Education'], periodStart: '2026-01-01', periodEnd: '2026-03-31', license: 'CC BY',
    });
  });

  it('keeps a station whose launches the RNLI does not count, with no count, never a zero', () => {
    // Sheringham: "Its launches are not counted here: the RNLI's launch records name the station differently."
    const sheringham = read('hero-watch-station-3468');
    expect(sheringham).toMatchObject({ kind: 'station', title: 'Sheringham lifeboat station', stationType: 'ILB' });
    expect(sheringham.kind === 'station' && sheringham.launches).toBeUndefined();
    expect(sheringham.kind === 'station' && sheringham.year).toBeUndefined();
    // A count without its year stands for nothing.
    const station = byD('hero-watch-station-4533');
    const noYear = readHeroWatchNote(without(station, 'year'));
    expect('refused' in noYear ? null : noYear.kind === 'station' && noYear.launches).toBeUndefined();
  });

  it('reads the week\'s summary, for the panel, placed nowhere', () => {
    const summary = read('hero-watch-2026-w41');
    expect(summary).toMatchObject({ kind: 'summary', week: '2026-w41', title: 'Hero Watch: the week to 8 October' });
    expect(summary.section).toBeUndefined();
    expect(summary.point).toBeUndefined();
  });

  it('refuses what is not Hero Watch as Mecha Jono sends it', () => {
    const station = byD('hero-watch-station-4533');
    const refused = (event: Event) => ('refused' in readHeroWatchNote(event) ? (readHeroWatchNote(event) as { refused: string }).refused : null);
    expect(refused({ ...station, pubkey: 'a'.repeat(64) })).toMatch(/named Hero Watch publisher/);
    expect(refused({ ...station, content: '{"launches": 9000}' })).toMatch(/content starts as data/);
    expect(refused(without(station, 't', 'hero_watch'))).toMatch(/not tagged hero_watch/);
    expect(refused(withTags(station, [...station.tags, ['t', 'starcom_intel']]))).toMatch(/also tagged starcom_intel/);
    expect(refused(withTags(station, station.tags.map((t) => (t[0] === 'd' ? ['d', 'raver-station-1'] : t))))).toMatch(/does not start hero-watch-/);
    expect(refused(without(without(station, 'geo'), 'g'))).toMatch(/a station with no place/);
    expect(refused(without(byD('hero-watch-appeal-'), 'jurisdiction'))).toMatch(/names no country/);
    expect(refused(without(byD('hero-watch-presence-et'), 'organisations'))).toMatch(/does not say how many organisations/);
    expect(refused(without(station, 'source'))).toMatch(/names no source/);
  });
});

describe('reading field missions', () => {
  it('reads each with its objectives, its window, its place and its safety limits', () => {
    const naloxone = read('starcom_mission_package_field-naloxone-NM') as FieldMission;
    expect(naloxone).toMatchObject({ kind: 'field_mission', section: 'FieldMissions', family: 'naloxone', state: 'open', jurisdiction: 'us-nm', harmReduction: true });
    expect(naloxone.id).toBe(`30079:${MECHA}:starcom_mission_package_field-naloxone-NM`);
    expect(naloxone.limits).toMatch(/Work in pairs/);
    expect(naloxone.objectives.length).toBeGreaterThan(0);
    expect(naloxone.objectives.every((o) => o.id.startsWith('field:naloxone') && o.ask.length > 0 && o.effortMinutes > 0)).toBe(true);
    expect(naloxone.validUntil).toBeGreaterThan(naloxone.validFrom);
  });

  it('places one by its jurisdiction, or the area its package names, or nowhere', () => {
    expect(read('starcom_mission_package_field-scam_shield-').jurisdiction).toBe('us');
    expect(read('starcom_mission_package_field-disaster_volunteer-').jurisdiction).toBe('us-wv');
    // The weekend's harm reduction spans 16 regions: no one place.
    const weekend = read('starcom_mission_package_field-weekend_harm_reduction-') as FieldMission;
    expect(weekend.jurisdiction).toBeUndefined();
    expect(weekend.harmReduction).toBe(true);
    expect((read('starcom_mission_package_field-scam_shield-') as FieldMission).harmReduction).toBe(false);
    // A package that names its area and carries no jurisdiction tag is placed by its area.
    const byArea = readFieldMission(without(byD('starcom_mission_package_field-naloxone-NM'), 'jurisdiction')) as FieldMission;
    expect(byArea.jurisdiction).toBe('us-nm');
  });

  it("follows its source: the package's r tags in order, else its manifest's source link (D-CT, CT2)", () => {
    // Sent on 10 October, before 3.19: its source only in metadata.mechaJono.source.link.
    const weekend = byD('starcom_mission_package_field-weekend_harm_reduction-');
    expect((readFieldMission(weekend) as FieldMission).sources).toEqual(['https://19hz.info/']);
    const tagged = withTags(weekend, [...weekend.tags, ['r', 'https://www.example.gov/alert'], ['r', 'javascript:alert(1)'], ['r', 'https://19hz.info/x']]);
    expect((readFieldMission(tagged) as FieldMission).sources).toEqual(['https://www.example.gov/alert', 'https://19hz.info/x']);
  });

  it('keeps a closed mission, as closed', () => {
    expect(read('starcom_mission_package_field-malware_takedown-')).toMatchObject({ state: 'closed' });
  });

  it('refuses a mission without its safety limits, or that is not a field mission package', () => {
    const naloxone = byD('starcom_mission_package_field-naloxone-NM');
    const manifest = JSON.parse(naloxone.content);
    const noLimits = { ...manifest, metadata: { ...manifest.metadata, mechaJono: { ...manifest.metadata.mechaJono, format: { ...manifest.metadata.mechaJono.format, limits: '' } } } };
    const refused = (event: Event) => (readFieldMission(event) as { refused?: string }).refused ?? null;
    expect(refused({ ...naloxone, content: JSON.stringify(noLimits) })).toMatch(/never shown without its safety limits/);
    expect(refused({ ...naloxone, content: 'not json' })).toMatch(/package that is not JSON/);
    expect(refused(without(naloxone, 't', 'field_mission'))).toMatch(/not tagged field_mission/);
    expect(refused({ ...naloxone, pubkey: 'b'.repeat(64) })).toMatch(/named Hero Watch publisher/);
    expect(refused({ ...naloxone, kind: 30078 })).toMatch(/not a mission package/);
  });
});

describe('what stands', () => {
  it('reads every Hero Watch note and field mission The Record held on 10 October, and nothing else', () => {
    const store = new HeroWatchStore([MECHA]);
    const kept = LIVE.map((e) => store.accept(e).kept);
    // All but the field mission's readable note, which the package stands for.
    expect(kept.filter(Boolean).length).toBe(LIVE.length - 1);
    const kinds = store.items().map((i) => i.kind);
    expect(kinds.filter((k) => k === 'station').length).toBe(3);
    expect(kinds.filter((k) => k === 'field_mission').length).toBe(6);
    expect(['operation', 'presence', 'summary'].every((k) => kinds.includes(k as HeroWatchItem['kind']))).toBe(true);
  });

  it('keeps the newest at each address, and lets a withdrawal end it', () => {
    const store = new HeroWatchStore([MECHA]);
    const station = byD('hero-watch-station-4533');
    store.accept(station);
    expect(store.accept({ ...station, created_at: station.created_at - 10, id: 'f'.repeat(64) })).toMatchObject({ kept: false, why: /newer/ });
    store.accept({ ...withTags(station, [...station.tags, ['t', 'retracted']]), created_at: station.created_at + 10, id: 'e'.repeat(64) });
    expect(store.items()).toEqual([]);
  });

  // Mecha Jono's key changes in early November 2026 (D-HW): the same note under both keys is one note.
  it('keeps one note across Mecha Jono\'s keys: the newer version stands, under its own address', () => {
    const NEW = 'a'.repeat(64);
    const store = new HeroWatchStore([NEW, MECHA], [{ name: 'mecha-jono', keys: [NEW, MECHA] }]);
    const station = byD('hero-watch-station-4533');
    store.accept(station);
    store.accept({ ...station, pubkey: NEW, created_at: station.created_at + 60, id: 'd'.repeat(64) });
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].id).toBe(`30023:${NEW}:hero-watch-station-4533`);
    // The old key's copy, arriving late, does not come back.
    expect(store.accept(station)).toMatchObject({ kept: false, why: /newer/ });
  });

  it('counts the kinds of Hero Watch note it does not read, so they are not silently dropped', () => {
    const store = new HeroWatchStore([MECHA]);
    const station = byD('hero-watch-station-4533');
    store.accept(withTags(station, station.tags.map((t) => (t[0] === 't' && t[1] === 'lifeboat_station' ? ['t', 'coastguard_station'] : t))));
    expect(store.unread()).toEqual([{ kind: 'coastguard_station', count: 1 }]);
  });
});

describe('signatures', () => {
  it('are checked by the pool Hero Watch reads through: a real event passes, the same with its words changed does not', () => {
    const pool = createRelayPool() as unknown as { verifyEvent: (e: Event) => boolean };
    const real = byD('hero-watch-station-2568');
    expect(pool.verifyEvent({ ...real })).toBe(true);
    expect(pool.verifyEvent({ ...real, content: `${real.content} (changed)` })).toBe(false);
  });
});

describe('reading The Record', () => {
  it('asks for Mecha Jono\'s Hero Watch notes and field mission packages only, a kind at a time', () => {
    vi.useFakeTimers();
    let handlers: Array<{ onevent: (e: Event) => void }> = [];
    const close = vi.fn();
    const subscribeMany = vi.fn((_relays: string[], _filter: unknown, h: { onevent: (e: Event) => void }) => { handlers.push(h); return { close }; });
    const heard = vi.fn();
    const stopListening = subscribeHeroWatch(heard);
    const stop = startHeroWatch({ pool: { subscribeMany } as never });
    expect(subscribeMany.mock.calls.map((c) => c[1])).toEqual([
      { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': ['hero_watch'] },
      { kinds: [30079], authors: [...MECHA_JONO_KEYS], '#t': ['field_mission'] },
    ]);
    expect(subscribeMany.mock.calls.every((c) => c[0].length === 1 && c[0][0] === THE_RECORD_RELAY)).toBe(true);
    handlers[0].onevent(byD('hero-watch-station-4533'));
    // A burst is gathered before it is told (burst.ts).
    expect(heard).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BURST_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heroWatchItems().map((i) => i.d)).toContain('hero-watch-station-4533');
    expect(heroWatchItems()).toBe(heroWatchItems());
    const second = startHeroWatch({ pool: { subscribeMany } as never });
    expect(subscribeMany).toHaveBeenCalledTimes(2);
    stop();
    expect(close).not.toHaveBeenCalled();
    second();
    expect(close).toHaveBeenCalledTimes(2);
    stopListening();
    handlers = [];
    vi.useRealTimers();
  });

  it('says when The Record has answered, and when it could not be read', () => {
    type H = { onevent: (e: Event) => void; oneose: () => void; onclose: (reasons: Array<{ url: string; reason: string }>) => void };
    const opened: H[] = [];
    const subscribeMany = vi.fn((_r: string[], _f: unknown, h: H) => { opened.push(h); return { close: vi.fn() }; });
    const stop = startHeroWatch({ pool: { subscribeMany } as never });
    expect(heroWatchStatus()).toEqual({ loaded: false, error: null, at: null });
    opened[0].oneose();
    expect(heroWatchStatus().loaded).toBe(false);
    opened[1].oneose();
    expect(heroWatchStatus()).toMatchObject({ loaded: true, error: null });
    stop();
    const again = startHeroWatch({ pool: { subscribeMany } as never });
    opened.at(-1)!.onclose([{ url: THE_RECORD_RELAY, reason: 'connection failed' }]);
    expect(heroWatchStatus()).toEqual({ loaded: false, error: 'The Record could not be read: connection failed', at: null });
    again();
  });
});

// Mecha Jono's key change (2 Nov 2026): a note re-signed under the new key keeps its time, by its carried tag.
describe('a Hero Watch note carried to Mecha Jono\'s new key', () => {
  const carried = (event: Event, firstSigned: number): Event =>
    ({ ...withTags(event, [...event.tags.filter((t) => t[0] !== 'published_at'), ['carried', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', String(firstSigned)]]), pubkey: MECHA_JONO_KEYS[0], created_at: 1_793_631_600 });

  it('keeps the week it was first published for, and a field mission keeps when it began', () => {
    const week = byD('hero-watch-2026-w41');
    const firstSigned = week.created_at;
    const note = readHeroWatchNote(carried(week, firstSigned)) as HeroWatchItem;
    expect(note.validFrom).toBe(firstSigned);
    const mission = byD('starcom_mission_package_field-naloxone-NM');
    const read = readFieldMission(carried(mission, mission.created_at)) as HeroWatchItem;
    expect(read.validFrom).toBe(mission.created_at);
  });
});
