/**
 * The report cap (BA4–BA7, plan block J, item 2): how many Intel Reports the
 * globe draws, as people choose it and as the share handle sets it for a page.
 *
 * Mecha Jono's daily briefing found the globe drawing 47–50 reports of the 128
 * they published that day, whatever window was set, and nothing saying so: the
 * cap was 50, fixed, with no control.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_REPORT_CAP, REPORT_CAP_MAX, REPORT_CAP_MIN, REPORT_CAP_STEPS, INGEST_HOLD_FLOOR,
  readReportCap, drawLimit, holdFor, capLabel, effectiveReportCap,
  setReportCapOverride, getReportCapOverride, subscribeReportCap,
} from '../reportCap';

beforeEach(() => setReportCapOverride(undefined));

describe('the choices (BA5)', () => {
  it('50, 100, 250, 500, Max at 1,000, Unlimited, or a number of one\'s own from 10; 50 by default (BA7)', () => {
    expect(REPORT_CAP_STEPS).toEqual([50, 100, 250, 500]);
    expect(REPORT_CAP_MAX).toBe(1000);
    expect(REPORT_CAP_MIN).toBe(10);
    expect(DEFAULT_REPORT_CAP).toBe(50);
  });

  it('reads a number, max or unlimited, and refuses anything else, saying why', () => {
    expect(readReportCap(250)).toBe(250);
    expect(readReportCap(37)).toBe(37);
    expect(readReportCap('max')).toBe(1000);
    expect(readReportCap('unlimited')).toBeNull();
    for (const bad of [9, 0, -5, 12.5, Number.NaN, Infinity, '50', 'all', true, {}]) {
      expect(readReportCap(bad), String(bad)).toEqual({ refused: expect.stringMatching(/a whole number from 10, 'max' or 'unlimited'/) });
    }
  });

  it('labels each as a person reads it', () => {
    expect(capLabel(50)).toBe('50');
    expect(capLabel(1000)).toBe('Max (1,000)');
    expect(capLabel(null)).toBe('Unlimited');
    expect(capLabel(1500)).toBe('1,500');
  });
});

describe('what a cap draws and holds (BA6)', () => {
  it('draws at most the cap, or everything when unlimited', () => {
    expect(drawLimit(50)).toBe(50);
    expect(drawLimit(null)).toBe(Infinity);
  });

  it('holds at least the 200 the ingest always has, more when the cap asks, everything when unlimited', () => {
    expect(INGEST_HOLD_FLOOR).toBe(200);
    expect(holdFor(50)).toBe(200);
    expect(holdFor(500)).toBe(500);
    expect(holdFor(null)).toBe(Infinity);
  });
});

describe('the handle\'s cap for a page (BA7)', () => {
  it('overrides the person\'s setting while set, and is never the setting itself', () => {
    expect(effectiveReportCap(100)).toEqual({ cap: 100, from: 'setting' });
    setReportCapOverride(1000);
    expect(effectiveReportCap(100)).toEqual({ cap: 1000, from: 'handle' });
    setReportCapOverride('unlimited');
    expect(effectiveReportCap(100)).toEqual({ cap: null, from: 'handle' });
    expect(getReportCapOverride()).toEqual({ cap: null });
    setReportCapOverride(undefined);
    expect(effectiveReportCap(100)).toEqual({ cap: 100, from: 'setting' });
    expect(getReportCapOverride()).toBeUndefined();
  });

  it('tells those listening when it changes', () => {
    let calls = 0;
    const stop = subscribeReportCap(() => { calls += 1; });
    setReportCapOverride(250);
    setReportCapOverride(undefined);
    stop();
    setReportCapOverride(500);
    expect(calls).toBe(2);
  });
});
