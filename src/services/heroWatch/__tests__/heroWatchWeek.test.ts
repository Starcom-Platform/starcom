/**
 * The week's front page (decision D-HW, step 7; HW10): Hero Watch's week on one card, its relief, its
 * lifeboat launches and its field missions, from what is drawn and from Mecha Jono's weekly roundup of
 * 10 October, whose launches for the week only it knows.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { readHeroWatchNote, type FieldMission, type ReliefOperation, type ReliefPresence, type WeekSummary } from '../heroWatch';
import { heroWatchWeek, roundupSentence } from '../heroWatchWeek';
import type { ReliefCountry } from '../heroWatchRelief';
import type { MissionPlace } from '../heroWatchMissions';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/hero-watch/hero_watch_live_2026-10-10.json'), 'utf8'));
const read = (prefix: string) => readHeroWatchNote(LIVE.find((e) => e.tags.some((t) => t[0] === 'd' && t[1].startsWith(prefix)))!);
const summary = read('hero-watch-2026-w41') as WeekSummary;
const op = read('hero-watch-appeal-') as ReliefOperation;
const presence = read('hero-watch-presence-') as ReliefPresence;
const ethiopia: ReliefCountry = { code: 'ET', name: 'Ethiopia', operations: [op], presence };
const mission = { title: 'Carry naloxone', limits: 'Work in pairs.' } as FieldMission;
const places: MissionPlace[] = [
  { code: 'us-nm', name: 'New Mexico', missions: [mission, mission] },
  { code: 'US', name: 'United States of America', missions: [mission] },
];
const middles = { ET: { lat: 8.6, lng: 39.6 }, 'us-nm': { lat: 34.4, lng: -106.1 }, US: { lat: 39.5, lng: -98.5 } } as Record<string, { lat: number; lng: number }>;

describe('the roundup\'s own words', () => {
  it('gives a section\'s first sentence, as written, without its markup', () => {
    expect(roundupSentence(summary.content, 'Lifeboats')).toBe('RNLI lifeboat crews launched 135 times from 76 stations on the same seven days of 2025 (2 to 8 October), and rendered assistance on 60 of those launches.');
    expect(roundupSentence(summary.content, 'Rescues')).toBeNull();
    expect(roundupSentence('**Lifeboats**\n\n**Next**\nx.', 'Lifeboats')).toBeNull();
  });
});

describe('the week\'s front page', () => {
  it('says the week\'s relief, its lifeboat launches in the roundup\'s words, and its open field missions', () => {
    const stationPoints = [{ lat: 51.1, lng: 1.3 }, { lat: 50.7, lng: -1.1 }];
    const week = heroWatchWeek({ summary, relief: [ethiopia], missions: places, unplacedMissions: 2, stations: 238, stationPoints, middleOf: (code) => middles[code] ?? null });
    expect(week.title).toBe('Hero Watch: the week to 8 October');
    expect(week.week).toBe('2026-w41');
    expect(week.lines).toEqual([
      'Relief: 1 operation and 144 organisations at work, in Ethiopia',
      'Lifeboats: RNLI lifeboat crews launched 135 times from 76 stations on the same seven days of 2025 (2 to 8 October), and rendered assistance on 60 of those launches.',
      'Field missions: 3 open in 2 places, each with its safety limits; 2 more name no one place',
      'From the weekly roundup on The Record, posted by an AI agent',
    ]);
    expect(week).toMatchObject({ relief: 1, missions: 3, stations: 238 });
    // One point a section, each its places' middle, so nine US missions do not turn the page away from one relief country.
    expect(week.points).toHaveLength(3);
    expect(week.points[0].lat).toBeCloseTo(middles.ET.lat, 6);
    expect(week.points[0].lng).toBeCloseTo(middles.ET.lng, 6);
    expect(week.points[1].lng).toBeGreaterThan(-106.1);
    expect(week.points[1].lng).toBeLessThan(-98.5);
    expect(week.points[2].lat).toBeGreaterThan(50.7);
    expect(week.points[2].lat).toBeLessThan(51.1);
  });

  it('counts what is drawn where the roundup is not read, and says so', () => {
    const week = heroWatchWeek({ summary: null, relief: [], missions: places, unplacedMissions: 0, stations: 238, stationPoints: [], middleOf: (code) => middles[code] ?? null });
    expect(week.title).toBe('Hero Watch · this week');
    expect(week.week).toBeNull();
    expect(week.lines).toEqual([
      'Relief: none standing',
      'Lifeboats: 238 RNLI stations drawn, sized by their launches in 2025',
      'Field missions: 3 open in 2 places, each with its safety limits',
      'The weekly roundup on The Record was not read, so this page counts what is drawn',
    ]);
  });

  it('names up to three countries and counts the rest', () => {
    const country = (code: string, name: string): ReliefCountry => ({ code, name, operations: [op], presence: null });
    const week = heroWatchWeek({
      summary, relief: [country('ET', 'Ethiopia'), country('SD', 'Sudan'), country('TD', 'Chad'), country('SO', 'Somalia')],
      missions: [], unplacedMissions: 0, stations: 0, stationPoints: [], middleOf: () => null,
    });
    expect(week.lines[0]).toBe('Relief: 4 operations, in Ethiopia, Sudan, Chad and 1 more country');
    expect(week.lines[2]).toBe('Field missions: none open');
  });

  it('is refused when there is nothing to say: a card of nothing says nothing', () => {
    expect(() => heroWatchWeek({ summary: null, relief: [], missions: [], unplacedMissions: 0, stations: 0, stationPoints: [], middleOf: () => null }))
      .toThrow('Hero Watch has nothing standing to put on a week\'s card: no roundup, relief, field mission or lifeboat is drawn.');
  });
});
