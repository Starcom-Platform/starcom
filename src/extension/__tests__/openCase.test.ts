/**
 * The case open in Uplink's side panel (decision D-EX, E2, EX16): chosen in the panel, opened again
 * the next time, and open only while the panel is.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { chooseOpenCase, lastPanelCase, openCaseForCaptures, releaseOpenCase } from '../openCase';

beforeEach(() => localStorage.clear());

describe('the case open for captures', () => {
  it('is the panel\'s choice, and none until it chooses', () => {
    expect(openCaseForCaptures()).toBeNull();
    chooseOpenCase('case-7');
    expect(openCaseForCaptures()).toBe('case-7');
    chooseOpenCase(null);
    expect(openCaseForCaptures()).toBeNull();
  });

  it('is let go when the panel closes, so captures stop going to a case no one sees', () => {
    chooseOpenCase('case-7');
    releaseOpenCase('case-7');
    expect(openCaseForCaptures()).toBeNull();
  });

  it('is kept when a panel closes after another has opened a different case', () => {
    chooseOpenCase('case-7');
    chooseOpenCase('case-9');
    releaseOpenCase('case-7');
    expect(openCaseForCaptures()).toBe('case-9');
  });

  it('opens with the case the panel had last, if that case still exists', () => {
    chooseOpenCase('case-7');
    releaseOpenCase('case-7');
    expect(lastPanelCase((id) => id === 'case-7')).toBe('case-7');
    expect(lastPanelCase(() => false)).toBeNull();
  });
});
