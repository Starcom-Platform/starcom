/**
 * What a mission made in Starcom asks to be counted (MX32): lines of the form `<what>: a count`, things never people
 * by NavCom's own words, so a report answers each with a whole number.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { countedBy, countLineOf, countLineProblem } from '../countLines';

// As the module bounds them: what is counted, 190 characters; its line, 200, as NavCom bounds an effect line.
const COUNT_WHAT_MAX = 190;
const COUNT_LINE_MAX = 200;

describe('count lines', () => {
  it('writes and reads back the line a count is asked by', () => {
    expect(countLineOf('  Naloxone kits placed: ')).toBe('Naloxone kits placed: a count');
    expect(countedBy('Naloxone kits placed: a count')).toBe('Naloxone kits placed');
    expect(countedBy('Something else')).toBe('Something else');
  });

  it('refuses what counts people, what is empty, long or asked already, and more than ten', () => {
    expect(countLineProblem('')).toBe('empty');
    expect(countLineProblem('People fed')).toBe('people');
    expect(countLineProblem('Meals for families')).toBe('people');
    expect(countLineProblem('Kits for the unhoused')).toBe('people');
    expect(countLineProblem('x'.repeat(COUNT_WHAT_MAX))).toBeNull();
    expect(countLineOf('x'.repeat(COUNT_WHAT_MAX)).length).toBeLessThanOrEqual(COUNT_LINE_MAX);
    expect(countLineProblem('x'.repeat(COUNT_WHAT_MAX + 1))).toBe('long');
    expect(countLineProblem('kits placed', ['Kits placed: a count'])).toBe('twice');
    const ten = Array.from({ length: 10 }, (_, i) => `Thing ${i}: a count`);
    expect(countLineProblem('One more thing', ten)).toBe('many');
    expect(countLineProblem('Meals served', ten.slice(0, 9))).toBeNull();
  });
});
