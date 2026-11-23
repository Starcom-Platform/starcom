/**
 * The package profile NavCom reads (interchange spec rev 11; D-MX: MX2, MX11,
 * MX13): whether anybody is behind a mission, whether one person takes it or
 * anybody joins, and for field work where and until when. A region, never a
 * point.
 */
import { describe, it, expect } from 'vitest';
import { missionProfile, fieldWorkProblem, profileTags, statedProfile, profileWords } from '../packageProfile';
import { REGION_CODE } from '../../exchange/schema';

const END = '2026-11-30T23:59:59.000Z';
const END_SECONDS = Date.parse(END) / 1000;
const BEFORE_END = Date.parse('2026-10-06T12:00:00Z');

describe('missionProfile', () => {
  it('says a mission is open, and that anybody joins unless one person takes it', () => {
    expect(missionProfile({})).toEqual({ missionState: 'open', claims: 'many' });
    expect(missionProfile({ claims: 'one' })).toEqual({ missionState: 'open', claims: 'one' });
  });

  it('names the agent that posted it, when an agent did (MX14)', () => {
    expect(missionProfile({}, 'mecha_jono')).toEqual({ missionState: 'open', claims: 'many', agent: 'mecha_jono' });
    expect(missionProfile({}, '')).toEqual({ missionState: 'open', claims: 'many' });
  });

  it('carries field work as its region, lower case, and its end in unix seconds', () => {
    expect(missionProfile({ fieldWork: { jurisdiction: ' US-CA ', until: END } })).toEqual({
      missionState: 'open', claims: 'many', fieldWork: { jurisdiction: 'us-ca', validUntil: END_SECONDS },
    });
  });

  it('never carries field work it could not check: no region, a region finer than a state, or no end', () => {
    expect(missionProfile({ fieldWork: { until: END } }).fieldWork).toBeUndefined();
    expect(missionProfile({ fieldWork: { jurisdiction: 'us-tx-leander', until: END } }).fieldWork).toBeUndefined();
    expect(missionProfile({ fieldWork: { jurisdiction: 'us-ca' } }).fieldWork).toBeUndefined();
    expect(missionProfile({ fieldWork: { jurisdiction: 'us-ca', until: 'soon' } }).fieldWork).toBeUndefined();
  });
});

describe('fieldWorkProblem', () => {
  it('has none for desk work, or for field work with a region and an end to come', () => {
    expect(fieldWorkProblem({}, BEFORE_END)).toBeNull();
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'us-ca', until: END } }, BEFORE_END)).toBeNull();
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'fr', until: END } }, BEFORE_END)).toBeNull();
  });

  it('asks for a region, and refuses anything finer than a state', () => {
    expect(fieldWorkProblem({ fieldWork: { until: END } }, BEFORE_END)).toMatch(/region/);
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'us-tx-leander', until: END } }, BEFORE_END)).toMatch(/country or a state/);
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'California', until: END } }, BEFORE_END)).toMatch(/country or a state/);
  });

  it('asks for an end, and refuses one already past', () => {
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'us-ca' } }, BEFORE_END)).toMatch(/end date/);
    expect(fieldWorkProblem({ fieldWork: { jurisdiction: 'us-ca', until: END } }, Date.parse(END))).toMatch(/ended 30 Nov 2026/);
  });

  it('asks for an objective: NavCom refuses field work nobody could report on (§4.3; D-MX MX28)', () => {
    const field = { jurisdiction: 'us-ca', until: END };
    expect(fieldWorkProblem({ fieldWork: field, objectives: [] }, BEFORE_END)).toMatch(/at least one objective/);
    expect(fieldWorkProblem({ fieldWork: field, objectives: [{ id: 'o1', description: 'Count', completed: false }] }, BEFORE_END)).toBeNull();
    expect(fieldWorkProblem({ objectives: [] }, BEFORE_END)).toBeNull();
  });
});

describe('REGION_CODE', () => {
  it('admits a country, or a state as ISO 3166-2 writes it, and nothing finer', () => {
    for (const code of ['us', 'us-ca', 'au-nsw', 'fr-75', 'gb-sct']) expect(REGION_CODE.test(code)).toBe(true);
    for (const code of ['usa', 'us-tx-leander', 'US', 'u', 'us-', 'us-abcd', 'eu-west']) expect(REGION_CODE.test(code)).toBe(false);
  });
});

describe('profileTags', () => {
  it('writes the state and the claims for desk work', () => {
    expect(profileTags({ missionState: 'open', claims: 'many' })).toEqual([
      ['mission_state', 'open'],
      ['claims', 'many'],
    ]);
  });

  it('adds navcom_mission, valid_until and jurisdiction for field work, and the agent when an agent posted', () => {
    expect(profileTags({
      missionState: 'open', claims: 'one', fieldWork: { jurisdiction: 'us-ca', validUntil: END_SECONDS }, agent: 'mecha_jono',
    })).toEqual([
      ['mission_state', 'open'],
      ['claims', 'one'],
      ['t', 'navcom_mission'],
      ['valid_until', String(END_SECONDS)],
      ['jurisdiction', 'us-ca'],
      ['agent', 'mecha_jono'],
    ]);
  });

  it('writes nothing for a package with no profile, as one from before rev 11 has', () => {
    expect(profileTags(undefined)).toEqual([]);
  });
});

describe('statedProfile', () => {
  const tags = (...t: string[][]) => ({ tags: [['d', 'x'], ['t', 'starcom_mission_package'], ...t] });

  it('reads what the tags say when no profile is signed, as NavCom reads them', () => {
    expect(statedProfile(tags(['mission_state', 'open'], ['claims', 'many'], ['t', 'navcom_mission'], ['valid_until', String(END_SECONDS)], ['jurisdiction', 'US-CA'], ['agent', 'mecha_jono']))).toEqual({
      missionState: 'open', claims: 'many', fieldWork: { jurisdiction: 'us-ca', validUntil: END_SECONDS }, agent: 'mecha_jono',
    });
  });

  it('takes the signed profile when there is one: the verifier has held the tags to it', () => {
    const signed = { missionState: 'closed' as const, claims: 'one' as const };
    expect(statedProfile(tags(['mission_state', 'open']), signed)).toBe(signed);
  });

  it('states nothing it was not told: no field work without its tag, its region or a whole end', () => {
    expect(statedProfile(tags())).toEqual({});
    expect(statedProfile(tags(['jurisdiction', 'us-ca'], ['valid_until', String(END_SECONDS)]))).toEqual({});
    expect(statedProfile(tags(['t', 'navcom_mission'], ['valid_until', 'soon'], ['jurisdiction', 'us-ca']))).toEqual({});
    expect(statedProfile(tags(['mission_state', 'pending'], ['claims', 'some']))).toEqual({});
  });
});

describe('profileWords', () => {
  it('says the state, who takes it, the field work with its end in UTC, and the agent', () => {
    expect(profileWords({ missionState: 'open', claims: 'many', fieldWork: { jurisdiction: 'us-ca', validUntil: END_SECONDS }, agent: 'mecha_jono' }))
      .toBe('Open · anybody joins · field work in us-ca until 30 Nov 2026 23:59Z · posted by an agent, mecha_jono');
    expect(profileWords({ missionState: 'claimed', claims: 'one' })).toBe('Claimed · one person takes it');
  });

  it('says nothing for a package that states nothing', () => {
    expect(profileWords({})).toBeNull();
  });
});
