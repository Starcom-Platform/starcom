/**
 * The coder's confidence (decision D-DP, DP10), from GDELT's Mentions table: a percent, 10 to 100,
 * that "indicates how aggressively GDELT had to perform tasks like coreference or grammatical
 * restructuring to extract the event" (its codebook). An event mentioned more than once is as sure
 * as its surest mention.
 *
 * The fixture is 47 real lines of GDELT's 20261013074500 Mentions file: every mention of six events
 * mentioned more than once with differing confidence, and fourteen mentioned once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { highestConfidence } from '../gdeltMentions';

const REAL = fs.readFileSync(path.join(__dirname, 'fixtures/gdelt-20261013074500.mentions.sample.csv'), 'utf8');

describe('the coder\'s highest confidence', () => {
  it('is each event\'s surest mention', () => {
    const sure = highestConfidence(REAL);
    expect(sure.size).toBe(20);
    expect(sure.get('1327627908')).toBe(50);
    expect(sure.get('1327656886')).toBe(30);
    expect(sure.get('1327639609')).toBe(100);
  });

  it('is kept only for the events asked about', () => {
    const sure = highestConfidence(REAL, new Set(['1327615587', 'not-there']));
    expect([...sure]).toEqual([['1327615587', 100]]);
  });

  it('gathers across the day\'s files, keeping the highest', () => {
    const day = new Map([['1327627908', 80], ['1327656886', 10]]);
    highestConfidence(REAL, undefined, day);
    expect(day.get('1327627908')).toBe(80);
    expect(day.get('1327656886')).toBe(30);
  });

  it('skips a line too short, or a confidence that is not a percent', () => {
    const line = REAL.split('\n')[0].split('\t');
    const bad = [line.slice(0, 8).join('\t'), [...line.slice(0, 11), 'high', ...line.slice(12)].join('\t'),
      [...line.slice(0, 11), '140', ...line.slice(12)].join('\t')].join('\n');
    expect(highestConfidence(bad).size).toBe(0);
  });
});
