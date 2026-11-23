/**
 * Why a mission's distribution cannot be changed where someone is looking, in
 * words that say what to do (plan item 9.13). It locks with the package from
 * Ready to publish on, since the package carries it; the way to change it is
 * back through Planning, and a mission already published has no way back.
 */
import { describe, it, expect } from 'vitest';
import { goesNowhereWords, missionDistributionLock } from '../MissionService';
import { MissionStatus } from '../../../types/intel/MissionUI';

describe('missionDistributionLock', () => {
  it('is open while the mission is a draft or being planned', () => {
    for (const status of [MissionStatus.DRAFT, MissionStatus.PLANNING]) {
      expect(missionDistributionLock({ status, visibility: undefined })).toBeNull();
      expect(missionDistributionLock({ status, visibility: 'public' })).toBeNull();
    }
  });

  it('says to move it back to Planning once its package is locked: to choose, or to change it', () => {
    for (const status of [MissionStatus.READY_FOR_PACKAGE, MissionStatus.PACKAGED]) {
      expect(missionDistributionLock({ status, visibility: undefined })).toBe('Its package is locked, so move it back to Planning to choose.');
      expect(missionDistributionLock({ status, visibility: 'limited' })).toBe('Its package is locked, so move it back to Planning to change it.');
    }
  });

  it('says a dispatched mission keeps the distribution it went out with', () => {
    expect(missionDistributionLock({ status: MissionStatus.DISPATCHED, visibility: 'public' })).toBe('It was published, so who may receive it stays as it went out.');
  });
});

describe('goesNowhereWords', () => {
  const UNDECIDED = 'Nobody has decided who may receive this mission, so it goes nowhere yet. Choose Public, Limited or Private.';
  const NO_RELAYS = 'This build has no relays to publish to.';
  const ready = MissionStatus.READY_FOR_PACKAGE;

  it('adds how to choose, or change, a distribution its locked package will not take', () => {
    expect(goesNowhereWords({ status: ready, visibility: undefined }, UNDECIDED))
      .toBe(`${UNDECIDED} Its package is locked, so move it back to Planning to choose.`);
    expect(goesNowhereWords({ status: ready, visibility: 'private' }, 'This mission is Private.'))
      .toBe('This mission is Private. Its package is locked, so move it back to Planning to change it.');
  });

  it('adds nothing where no distribution would send it, or where one can be chosen as it is', () => {
    expect(goesNowhereWords({ status: ready, visibility: 'public' }, NO_RELAYS)).toBe(NO_RELAYS);
    expect(goesNowhereWords({ status: MissionStatus.PLANNING, visibility: undefined }, UNDECIDED)).toBe(UNDECIDED);
    expect(goesNowhereWords({ status: ready, visibility: 'limited' }, null)).toBeNull();
  });
});
