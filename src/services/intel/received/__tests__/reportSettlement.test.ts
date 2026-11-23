/**
 * How a report sent from here stands, by NavCom's rules (its mission interchange §5.3; D-MX, MX28). The cases follow
 * NavCom's own tests of its `settlementOf`, so a report reads the same in both apps.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { MissionLabel, MissionLabelValue } from '../../missionLabels';
import { CHALLENGE_WINDOW_S, labelHeard, settlementOf, settlersOf } from '../reportSettlement';

const POSTER = 'a'.repeat(64);
const REPORTER = 'b'.repeat(64);
const WITNESS = 'c'.repeat(64);
const CHALLENGER = 'd'.repeat(64);
const EXPOSED = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const NEXT = '86f824c3f1e67c60b1dc15ce110648c4de5c3fb879022fbbcc5e8deb720e402c';
const MISSION = `30079:${POSTER}:field-naloxone`;
const DAY = Date.parse('2026-10-16T00:00:00Z') / 1000;
const report = { id: 'r'.repeat(64), author: REPORTER, at: DAY };
const settlers = new Set([POSTER]);

let n = 0;
const label = (pubkey: string, value: MissionLabelValue, createdAt = DAY + 3_600, about = report.id): MissionLabel =>
  ({ id: `label-${(n += 1)}`, pubkey, value, coordinates: [MISSION], report: about, createdAt });

describe('settlementOf', () => {
  it('waits seven days for a challenge', () => {
    expect(settlementOf(report, settlers, [], DAY + 60)).toEqual({ state: 'pending', until: DAY + CHALLENGE_WINDOW_S, challengedBy: [] });
  });

  it('is settled by the poster, and only by the poster', () => {
    expect(settlementOf(report, settlers, [label(POSTER, 'settled')], DAY + 7_200)).toEqual({ state: 'settled', how: 'poster', by: POSTER, at: DAY + 3_600, challengedBy: [] });
    expect(settlementOf(report, settlers, [label(WITNESS, 'settled')], DAY + 7_200).state).toBe('pending');
  });

  it('is settled by a witness who is not the reporter', () => {
    expect(settlementOf(report, settlers, [label(WITNESS, 'witnessed')], DAY + 7_200)).toMatchObject({ state: 'settled', how: 'witness', by: WITNESS });
    expect(settlementOf(report, settlers, [label(REPORTER, 'witnessed')], DAY + 7_200).state).toBe('pending');
  });

  it('lets the poster\'s settlement outrank a witness\'s, whichever claims to be first', () => {
    const labels = [label(WITNESS, 'witnessed', DAY + 60), label(POSTER, 'settled', DAY + 7_000)];
    expect(settlementOf(report, settlers, labels, DAY + 7_300)).toMatchObject({ how: 'poster' });
    expect(settlementOf(report, settlers, [...labels].reverse(), DAY + 7_300)).toMatchObject({ how: 'poster' });
  });

  it('names the earliest of each, when two said it', () => {
    const second = 'e'.repeat(64);
    expect(settlementOf(report, settlers, [label(WITNESS, 'witnessed', DAY + 900), label(second, 'witnessed', DAY + 600)], DAY + 7_200)).toMatchObject({ by: second, at: DAY + 600 });
    const both = new Set([POSTER, second]);
    expect(settlementOf(report, both, [label(POSTER, 'settled', DAY + 900), label(second, 'settled', DAY + 600)], DAY + 7_200)).toMatchObject({ how: 'poster', by: second, at: DAY + 600 });
  });

  it('waits until the last second of the seventh day, and settles by itself at the next', () => {
    expect(settlementOf(report, settlers, [], DAY + 604_799).state).toBe('pending');
    expect(settlementOf(report, settlers, [], DAY + 604_800)).toEqual({ state: 'settled', how: 'silence', at: DAY + 604_800, challengedBy: [] });
  });

  it('reads the poster\'s and a witness\'s settlement over silence when read after the seven days', () => {
    const day8 = DAY + 8 * 86_400;
    expect(settlementOf(report, settlers, [label(POSTER, 'settled')], day8)).toMatchObject({ how: 'poster' });
    expect(settlementOf(report, settlers, [label(WITNESS, 'witnessed')], day8)).toMatchObject({ how: 'witness' });
  });

  it('names a challenge and reverses nothing; one dated as the seven days end counts for nothing', () => {
    const s = settlementOf(report, settlers, [label(CHALLENGER, 'challenged'), label(CHALLENGER, 'challenged', DAY + 4_000), label(POSTER, 'settled')], DAY + 7_200);
    expect(s).toMatchObject({ state: 'settled', how: 'poster', challengedBy: [CHALLENGER] });
    const last = label(CHALLENGER, 'challenged', DAY + CHALLENGE_WINDOW_S - 1);
    const late = label(WITNESS, 'challenged', DAY + CHALLENGE_WINDOW_S);
    expect(settlementOf(report, settlers, [last, late], DAY + CHALLENGE_WINDOW_S + 2)).toMatchObject({ how: 'silence', challengedBy: [CHALLENGER] });
    expect(settlementOf(report, settlers, [label(REPORTER, 'challenged')], DAY + 60).challengedBy).toEqual([]);
  });

  it('does not read a label from a clock more than a day ahead', () => {
    const now = DAY + 60;
    expect(settlementOf(report, settlers, [label(POSTER, 'settled', now + 86_401)], now).state).toBe('pending');
    expect(settlementOf(report, settlers, [label(POSTER, 'settled', now + 86_400)], now).state).toBe('settled');
  });

  it('reads a label on one report as saying nothing about another on the same mission', () => {
    expect(settlementOf(report, settlers, [label(POSTER, 'settled', DAY + 60, 'o'.repeat(64))], DAY + 7_200).state).toBe('pending');
  });

  it('reads no label at all from an exposed key, whichever word it says', () => {
    const all = new Set([POSTER, EXPOSED]);
    expect(settlementOf(report, all, [label(EXPOSED, 'settled')], DAY + 7_200).state).toBe('pending');
    expect(settlementOf(report, all, [label(EXPOSED, 'witnessed')], DAY + 7_200).state).toBe('pending');
    expect(settlementOf(report, all, [label(EXPOSED, 'challenged')], DAY + 7_200).challengedBy).toEqual([]);
    // It settles by silence instead, which still counts.
    expect(settlementOf(report, all, [label(EXPOSED, 'settled')], DAY + CHALLENGE_WINDOW_S)).toMatchObject({ how: 'silence' });
  });
});

const START = DAY + 86_400;
const records = {
  publishers: [{ name: 'mecha-jono', keys: [NEXT, EXPOSED] }],
  starts: { [EXPOSED]: '2025-01-01T00:00:00Z', [NEXT]: new Date(START * 1000).toISOString() },
  exposed: { [EXPOSED]: '2026-09-28' },
};

describe('settlersOf', () => {
  it('is the poster alone, for a publisher whose keys do not rotate', () => {
    expect([...settlersOf(POSTER, DAY, { publishers: [] })]).toEqual([POSTER]);
    expect([...settlersOf(POSTER.toUpperCase(), DAY, { publishers: [] })]).toEqual([POSTER]);
  });

  it('is every key of a rotating publisher that speaks then, whichever key posted the mission: none before the next starts', () => {
    expect([...settlersOf(EXPOSED, DAY, records)]).toEqual([]);
    expect([...settlersOf(EXPOSED, START, records)]).toEqual([NEXT]);
    expect([...settlersOf(NEXT, START, records)]).toEqual([NEXT]);
  });

  it('is nobody of Mecha Jono\'s today, as NavCom reads it: one key exposed, the next not started', () => {
    expect([...settlersOf(EXPOSED, DAY)]).toEqual([]);
  });
});

describe('labelHeard', () => {
  it('hears a rotating publisher\'s key only from its start, and never a label it signed dated before then', () => {
    expect(labelHeard(START - 1, records)(NEXT, START - 60)).toBe(false);
    expect(labelHeard(START, records)(NEXT, START)).toBe(true);
    expect(labelHeard(START + 86_400, records)(NEXT, START - 60)).toBe(false);
    expect(labelHeard(START, records)(EXPOSED, DAY)).toBe(false);
    expect(labelHeard(START, records)(WITNESS, DAY)).toBe(true);
  });

  it('so the next key\'s settlement counts only once it has started', () => {
    const settled = [label(NEXT, 'settled', START + 60)];
    const later = START + 120;
    expect(settlementOf(report, settlersOf(EXPOSED, later, records), settled, later, labelHeard(later, records))).toMatchObject({ how: 'poster', by: NEXT });
    expect(settlementOf(report, settlersOf(EXPOSED, START - 1, records), [label(NEXT, 'settled', START - 60)], START - 1, labelHeard(START - 1, records)).state).toBe('pending');
  });
});
