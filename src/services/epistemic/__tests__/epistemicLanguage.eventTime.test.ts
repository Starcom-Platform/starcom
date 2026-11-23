import { describe, it, expect } from 'vitest';
import { placedByWrittenTime, untimedNotPlaced } from '../epistemicLanguage';

describe('placedByWrittenTime', () => {
  it('says how many, how they were placed, and why, as a note rather than a warning', () => {
    // Decided 2026-09-14 (docs/missions/01-architecture-decisions/time-model.md).
    expect(placedByWrittenTime(31, 31, 'report')).toEqual({
      tone: 'info',
      text: '31 of 31 reports placed by when they were written — no stated event time.',
    });
  });

  it('reads correctly for one record', () => {
    expect(placedByWrittenTime(1, 3, 'report').text).toBe('1 of 3 reports placed by when it was written — no stated event time.');
    expect(placedByWrittenTime(1, 1, 'report').text).toBe('1 of 1 report placed by when it was written — no stated event time.');
  });
});

/*
 * Reports with no readable time are left out of a time window, and the globe
 * says so as its own fact: "no stated time" is not "outside the window"
 * (decision D-C; D-F step 15).
 */
describe('untimedNotPlaced', () => {
  it('says how many were left out, and why', () => {
    expect(untimedNotPlaced(2, 9, 'report').text)
      .toBe('2 of 9 reports not placed on the timeline — no stated time.');
    expect(untimedNotPlaced(1, 1, 'report').text)
      .toBe('1 of 1 report not placed on the timeline — no stated time.');
  });
});
