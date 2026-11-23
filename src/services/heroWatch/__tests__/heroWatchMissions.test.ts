/**
 * Hero Watch's field missions by place (decision D-HW, step 5; HW6): the open missions of the live
 * packages of 10 October 2026, gathered under the state or country each names; the pill a place
 * carries; and what its hover says, never a mission without its safety limits.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { readFieldMission, type FieldMission } from '../heroWatch';
import { describeMissions, missionPlaceCode, missionsByPlace, missionsPill, type MissionPlace } from '../heroWatchMissions';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/hero-watch/hero_watch_live_2026-10-10.json'), 'utf8'));
const missions = () => LIVE.filter((e) => e.kind === 30079).map((e) => readFieldMission(e) as FieldMission);
const mission = (family: string) => missions().find((m) => m.family === family)!;
const PLACES: Record<string, string> = { US: 'United States of America', 'us-nm': 'New Mexico', 'us-wv': 'West Virginia', GU: 'Guam' };
const outlineOf = (code: string) => (PLACES[code] ? { name: PLACES[code] } : null);

describe('where a field mission is drawn', () => {
  it('is its state, a US territory\'s own outline, or its country; never a subdivision widened', () => {
    expect(missionPlaceCode('us-nm')).toBe('us-nm');
    expect(missionPlaceCode('us-gu')).toBe('GU');
    expect(missionPlaceCode('us-pr')).toBe('PR');
    expect(missionPlaceCode('us')).toBe('US');
    expect(missionPlaceCode('US-NM')).toBe('us-nm');
    expect(missionPlaceCode('gb-eng')).toBeNull();
    expect(missionPlaceCode(undefined)).toBeNull();
  });
});

describe('field missions by place', () => {
  it('gathers the open missions under the place each names, and counts those with none drawn here', () => {
    const { places, unplaced } = missionsByPlace(missions(), outlineOf);
    expect(places.map((p) => [p.code, p.name, p.missions.length])).toEqual([
      ['us-nm', 'New Mexico', 1], ['US', 'United States of America', 1], ['us-wv', 'West Virginia', 1],
    ]);
    // The weekend's harm reduction and the public comments name no place; the closed takedown is not drawn at all.
    expect(unplaced.map((m) => m.family).sort()).toEqual(['public_comment', 'weekend_harm_reduction']);
  });

  it('counts a mission whose place has no outline here as not drawn, and lists a place\'s missions ending soonest first', () => {
    const later = { ...mission('naloxone'), id: 'later', validUntil: mission('naloxone').validUntil + 86_400 };
    const { places, unplaced } = missionsByPlace([later, mission('naloxone'), { ...mission('naloxone'), id: 'nowhere', jurisdiction: 'us-ak' }], outlineOf);
    expect(places[0].missions.map((m) => m.id)).toEqual([mission('naloxone').id, 'later']);
    expect(unplaced.map((m) => m.id)).toEqual(['nowhere']);
  });
});

describe('a place\'s pill', () => {
  it('names the place and counts its open missions', () => {
    const place = (n: number): MissionPlace => ({ code: 'us-nm', name: 'New Mexico', missions: Array.from({ length: n }, () => mission('naloxone')) });
    expect(missionsPill(place(1))).toBe('New Mexico · 1 mission');
    expect(missionsPill(place(3))).toBe('New Mexico · 3 missions');
  });
});

describe('what a place\'s hover says', () => {
  it('names each mission, its asks, its time and its end, and its limits, always', () => {
    const [newMexico] = missionsByPlace([mission('naloxone')], outlineOf).places;
    expect(describeMissions(newMexico)).toBe([
      'New Mexico: 1 open field mission.',
      '• Carry naloxone in New Mexico: overdose deaths up 28.1% in a year: 4 asks, 75 minutes in all, open to 8 Nov 2026.',
      `Its limits: ${mission('naloxone').limits}`,
    ].join('\n'));
  });

  it('says limits once where the missions share them, and each mission\'s where they differ', () => {
    const shared: MissionPlace = { code: 'us-nm', name: 'New Mexico', missions: [mission('naloxone'), { ...mission('naloxone'), id: 'b', title: 'Second' }] };
    const said = describeMissions(shared);
    expect(said).toContain(`\nTheir limits: ${mission('naloxone').limits}`);
    expect(said.split(mission('naloxone').limits)).toHaveLength(2);
    const differ: MissionPlace = { code: 'us-nm', name: 'New Mexico', missions: [mission('naloxone'), { ...mission('naloxone'), id: 'b', title: 'Second', limits: 'Stay in public places.' }] };
    expect(describeMissions(differ)).toContain(`\nLimits for Carry naloxone in New Mexico: overdose deaths up 28.1% in a year: ${mission('naloxone').limits}`);
    expect(describeMissions(differ)).toContain('\nLimits for Second: Stay in public places.');
  });

  it('says the sentences their limits share once, then each mission\'s own, so the hover stays short and every limit is said', () => {
    const core = 'Work in pairs. Never confront anyone, enter private property or take anyone\'s personal details. Look after yourself first.';
    const place: MissionPlace = {
      code: 'us-nm', name: 'New Mexico',
      missions: [
        { ...mission('naloxone'), id: 'a', title: 'Carry naloxone', limits: `${core} If someone is unresponsive, call 911 first. Naloxone does no harm.` },
        { ...mission('naloxone'), id: 'b', title: 'Disaster relief', limits: `${core} Never self-deploy into a disaster area: go only where a registered relief group sends you.` },
      ],
    };
    const lines = describeMissions(place).split('\n');
    expect(lines.slice(3)).toEqual([
      `Their limits: ${core}`,
      'Also for Carry naloxone: If someone is unresponsive, call 911 first. Naloxone does no harm.',
      'Also for Disaster relief: Never self-deploy into a disaster area: go only where a registered relief group sends you.',
    ]);
  });

  it('names three missions and counts the rest, never naming one without its limits', () => {
    const many: MissionPlace = {
      code: 'us-nm', name: 'New Mexico',
      missions: ['A', 'B', 'C', 'D', 'E'].map((title) => ({ ...mission('naloxone'), id: title, title, limits: `Limits of ${title}.` })),
    };
    const said = describeMissions(many);
    expect(said).toContain('\nand 2 more.');
    for (const title of ['A', 'B', 'C']) expect(said).toContain(`Limits for ${title}: Limits of ${title}.`);
    expect(said).not.toContain('• D');
  });
});
