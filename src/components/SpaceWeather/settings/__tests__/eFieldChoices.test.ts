/**
 * The fetch cadence the e-field and the aurora share (space-weather-visualization.md, SW2): read from
 * the settings and written back, "once" being no refresh at all.
 */
import { describe, expect, it } from 'vitest';
import { refreshMinutesOf, refreshSettingsFor } from '../eFieldChoices';

describe('the fetch cadence', () => {
  it('is the interval set, every 5 minutes unless set, and once when refreshing is off', () => {
    expect(refreshMinutesOf({ autoRefresh: true, refreshInterval: 15 })).toBe(15);
    expect(refreshMinutesOf({})).toBe(5);
    expect(refreshMinutesOf({ autoRefresh: false, refreshInterval: 15 })).toBe(0);
  });

  it('is written back as the settings say it', () => {
    expect(refreshSettingsFor(30)).toEqual({ autoRefresh: true, refreshInterval: 30 });
    expect(refreshSettingsFor(0)).toEqual({ autoRefresh: false });
  });
});
