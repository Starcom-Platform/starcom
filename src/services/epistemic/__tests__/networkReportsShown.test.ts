/**
 * The globe says how many reports from the network it is showing, so a first visitor
 * who sees 7 reports on it and "0 events" on the timeline can tell the two count
 * different things (decision D-F, step 1).
 */
import { describe, it, expect } from 'vitest';
import { networkReportsShown, emptyBecause } from '../epistemicLanguage';

describe('networkReportsShown', () => {
  it('says how many reports from the network the globe is showing', () => {
    expect(networkReportsShown(7).text).toBe('Showing 7 reports from the network');
    expect(networkReportsShown(1).text).toBe('Showing 1 report from the network');
  });
});

describe('emptyBecause, with nothing in the working set', () => {
  it('says there is nothing of yours to analyse, not nothing at all', () => {
    const text = emptyBecause('', 'no-observations').text;
    expect(text).toMatch(/nothing of yours to analyse/i);
    expect(text).not.toMatch(/in this working set/i);
  });
});
