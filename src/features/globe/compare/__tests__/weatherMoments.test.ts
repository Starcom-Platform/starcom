/**
 * Earth Weather now beside a forecast hour (D-CM, CM5): the two hours drawn, each half's name, and the forecast copy
 * of each field keeping to its own half (it never says what the globe's own fields have drawn).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aheadLabel, weatherHalfLabels, weatherHours } from '../weatherMoments';

const NOW = Date.parse('2026-11-04T06:37:00Z');
const HOUR = 3_600_000;

describe('the two hours', () => {
  it('count from the hour while live, so the right half stays put as the minutes pass', () => {
    expect(weatherHours(null, 6, NOW)).toEqual({ shownAt: Date.parse('2026-11-04T06:00:00Z'), thenAt: Date.parse('2026-11-04T12:00:00Z') });
    expect(weatherHours(null, 6, NOW + 20 * 60_000).thenAt).toBe(Date.parse('2026-11-04T12:00:00Z'));
  });

  it('count from the moment shown while paused', () => {
    const shown = Date.parse('2026-11-05T18:00:00Z');
    expect(weatherHours(shown, 168, NOW)).toEqual({ shownAt: shown, thenAt: shown + 168 * HOUR });
  });
});

describe('each half', () => {
  it('is now beside a named forecast hour while live', () => {
    const hours = weatherHours(null, 6, NOW);
    expect(weatherHalfLabels(null, hours, NOW)).toEqual({ left: 'Earth Weather, now', right: 'Earth Weather, 4 Nov 12:00Z, forecast' });
  });

  it('says "forecast" only for an hour still to come', () => {
    const past = Date.parse('2026-11-03T00:00:00Z');
    const labels = weatherHalfLabels(past, weatherHours(past, 12, NOW), NOW);
    expect(labels.left).not.toMatch(/forecast/);
    expect(labels.right).not.toMatch(/forecast/);
    const ahead = Date.parse('2026-11-06T00:00:00Z');
    const later = weatherHalfLabels(ahead, weatherHours(ahead, 24, NOW), NOW);
    expect(later.left).toMatch(/, forecast$/);
    expect(later.right).toMatch(/7 Nov 00:00Z, forecast$/);
  });

  it('names the step as the forecast strip does', () => {
    expect([6, 12, 24, 72, 168].map(aheadLabel)).toEqual(['+6 h', '+12 h', '+1 d', '+3 d', '+7 d']);
  });
});

describe('the forecast copy of each field', () => {
  it('never notes what is drawn for the globe\'s own: a clip sweeping the hours waits on the left half\'s', () => {
    for (const hook of ['useGlobeHeatMap', 'useGlobeRain', 'useGlobeWindFlow', 'useGlobeRealClouds']) {
      const source = readFileSync(resolve(__dirname, `../../../../components/Globe/Hooks/${hook}.ts`), 'utf8');
      const notes = source.split('\n').filter((line) => /\b(noteDrawn|forgetDrawn)\(/.test(line) && !/^\s*(import|\/\/|\*)/.test(line));
      expect(notes.length, hook).toBeGreaterThan(0);
      for (const line of notes) expect(line, `${hook}: ${line.trim()}`).toMatch(/\bmain\b/);
    }
  });
});
