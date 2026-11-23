/**
 * How far ahead the timeline reaches (space-weather-visualization.md, SW19): each layer that forecasts
 * publishes the last moment it has, while shown; the timeline reaches the farthest.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getForecastReach, publishForecastReach, resetForecastReachForTest, subscribeForecastReach } from '../forecastReach';

afterEach(() => resetForecastReachForTest());

describe('the forecast\'s reach', () => {
  it('is the farthest a shown layer forecasts to, and none once none does', () => {
    expect(getForecastReach()).toBeNull();
    publishForecastReach('enlil', { until: 2_000, by: 'ENLIL' });
    publishForecastReach('other', { until: 1_000, by: 'Other' });
    expect(getForecastReach()).toEqual({ until: 2_000, by: 'ENLIL' });
    publishForecastReach('enlil', null);
    expect(getForecastReach()).toEqual({ until: 1_000, by: 'Other' });
    publishForecastReach('other', null);
    expect(getForecastReach()).toBeNull();
  });

  it('keeps one answer between changes, and tells its readers only of changes', () => {
    const heard = vi.fn();
    const leave = subscribeForecastReach(heard);
    publishForecastReach('enlil', { until: 2_000, by: 'ENLIL' });
    const first = getForecastReach();
    publishForecastReach('enlil', { until: 2_000, by: 'ENLIL' });
    expect(getForecastReach()).toBe(first);
    expect(heard).toHaveBeenCalledTimes(1);
    leave();
    publishForecastReach('enlil', null);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
