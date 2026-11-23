/**
 * Earth Weather's moment as its key and a card say it (decision D-W, step
 * 5a): the hour the weather is drawn for, and a forecast called one.
 */
import { describe, it, expect } from 'vitest';
import { weatherWhen, WEATHER_CLOCK_MS } from '../weatherMoment';

const NOW = Date.parse('2026-10-06T22:12:00Z');

describe('weatherWhen', () => {
  it('says the moment, in UTC marked Z, with its date', () => {
    expect(weatherWhen(NOW, NOW)).toBe('for 6 Oct 22:12Z');
    expect(weatherWhen(Date.parse('2026-10-05T03:00:00Z'), NOW)).toBe('for 5 Oct 03:00Z');
  });

  it('calls a moment still to come a forecast, but not one within the clock\'s minute', () => {
    expect(weatherWhen(Date.parse('2026-10-07T06:00:00Z'), NOW)).toBe('forecast for 7 Oct 06:00Z');
    expect(weatherWhen(NOW + WEATHER_CLOCK_MS, NOW)).toBe('for 6 Oct 22:13Z');
  });
});
