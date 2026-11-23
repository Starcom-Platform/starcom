/**
 * Quest lines and quests (decision D-RS, RS8, RS9, RS29–RS31): a quest line's missions in order, each finished one
 * unlocking the next; a quest's in no order. Progress is worked out on the device from what is finished there, and
 * which quest lines a person has started is kept there, never posted.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { questSteps, questTally, isStarted, leaveQuestLine, startQuestLine, startedQuestLines, subscribeQuests } from '../questProgress';
import type { RosterItem } from '../rosterItem';

const M = (n: number) => `30079:${'a'.repeat(64)}:mission-${n}`;
const line = (kind: RosterItem['kind'], coordinates: string[]): Pick<RosterItem, 'kind' | 'counts'> => ({
  kind, counts: coordinates.map((coordinate) => ({ coordinate, relay: '' })),
});

describe('questSteps', () => {
  it('a quest line: the first unfinished is next, each after it waits on the one before', () => {
    const done: Record<string, string> = { [M(1)]: '2026-10-12T09:00:00Z' };
    expect(questSteps(line('quest_line', [M(1), M(2), M(3), M(4)]), (c) => done[c])).toEqual([
      { coordinate: M(1), state: 'finished', finishedAt: '2026-10-12T09:00:00Z' },
      { coordinate: M(2), state: 'next' },
      { coordinate: M(3), state: 'after', after: M(2) },
      { coordinate: M(4), state: 'after', after: M(3) },
    ]);
  });

  it('a quest line keeps one finished out of order finished, and the next is still the first unfinished', () => {
    const done: Record<string, string> = { [M(3)]: '2026-10-12T09:00:00Z' };
    expect(questSteps(line('quest_line', [M(1), M(2), M(3)]), (c) => done[c]).map((s) => s.state)).toEqual(['next', 'after', 'finished']);
  });

  it('a quest: each open or finished, none locked', () => {
    const done: Record<string, string> = { [M(2)]: '2026-10-12T09:00:00Z' };
    expect(questSteps(line('quest', [M(1), M(2), M(3)]), (c) => done[c]).map((s) => s.state)).toEqual(['open', 'finished', 'open']);
  });

  it('counts a mission linked twice once, where it first stands', () => {
    expect(questSteps(line('quest_line', [M(1), M(2), M(1)]), () => undefined).map((s) => s.coordinate)).toEqual([M(1), M(2)]);
  });
});

describe('questTally', () => {
  it('says how many are finished of how many, and which is next', () => {
    const done: Record<string, string> = { [M(1)]: '2026-10-12T09:00:00Z' };
    expect(questTally(questSteps(line('quest_line', [M(1), M(2), M(3)]), (c) => done[c]))).toEqual({ finished: 1, total: 3, next: M(2) });
    expect(questTally(questSteps(line('quest', [M(1)]), (c) => done[c]))).toEqual({ finished: 1, total: 1 });
  });
});

describe('started quest lines', () => {
  const ADDRESS = `30084:${'b'.repeat(64)}:quest_line-birds`;
  beforeEach(() => { for (const s of startedQuestLines()) leaveQuestLine(s.address); localStorage.clear(); });

  it('starts one on this device, tells who listens, and leaves it', () => {
    let told = 0;
    const stop = subscribeQuests(() => { told += 1; });
    expect(startQuestLine(ADDRESS, Date.parse('2026-10-17T15:00:00Z'))).toBe(true);
    expect(isStarted(ADDRESS)).toBe(true);
    expect(startedQuestLines()).toEqual([{ address: ADDRESS, since: '2026-10-17T15:00:00.000Z' }]);
    expect(JSON.parse(localStorage.getItem('starcom.quests.v1') ?? '[]')).toEqual([{ address: ADDRESS, since: '2026-10-17T15:00:00.000Z' }]);
    leaveQuestLine(ADDRESS);
    expect(isStarted(ADDRESS)).toBe(false);
    expect(told).toBe(2);
    stop();
  });

  it('keeps when it was first started, and the same list until it changes', () => {
    startQuestLine(ADDRESS, Date.parse('2026-10-17T15:00:00Z'));
    const first = startedQuestLines();
    startQuestLine(ADDRESS, Date.parse('2026-10-18T15:00:00Z'));
    expect(startedQuestLines()).toBe(first);
    expect(first[0].since).toBe('2026-10-17T15:00:00.000Z');
  });

  it('starts only a roster item\'s address', () => {
    expect(startQuestLine(M(1))).toBe(false);
    expect(startQuestLine('not an address')).toBe(false);
    expect(startedQuestLines()).toEqual([]);
  });
});
