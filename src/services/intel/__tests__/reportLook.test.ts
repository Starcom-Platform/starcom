/**
 * How Intel Report glyphs look (BA14, BA15; plan block J, item 5): a person's
 * setting, on unless they turn it off, and the share handle's for its page,
 * never saved, as the report cap's (BA7).
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  emblemsChosen, effectiveReportLook, readReportLook, setReportLookOverride, getReportLookOverride, subscribeReportLook,
} from '../reportLook';

beforeEach(() => setReportLookOverride(undefined));

describe('the person\'s setting (BA15)', () => {
  it('on unless they turned it off, including for a setting saved before there was a choice', () => {
    expect(emblemsChosen({})).toBe(true);
    expect(emblemsChosen({ categoryEmblems: true })).toBe(true);
    expect(emblemsChosen({ categoryEmblems: false })).toBe(false);
  });
});

describe('the handle\'s look for a page', () => {
  it('holds while set, and is never the setting itself', () => {
    expect(effectiveReportLook({ emblems: true })).toEqual({ emblems: true, from: 'setting' });
    setReportLookOverride({ emblems: false });
    expect(effectiveReportLook({ emblems: true })).toEqual({ emblems: false, from: 'handle' });
    expect(getReportLookOverride()).toEqual({ emblems: false });
    setReportLookOverride(undefined);
    expect(effectiveReportLook({ emblems: true })).toEqual({ emblems: true, from: 'setting' });
  });

  it('tells those listening when it changes', () => {
    let calls = 0;
    const stop = subscribeReportLook(() => { calls += 1; });
    setReportLookOverride({ emblems: true });
    setReportLookOverride(undefined);
    stop();
    setReportLookOverride({ emblems: false });
    expect(calls).toBe(2);
  });

  it('reads a look as asked for, refusing anything else and saying why', () => {
    expect(readReportLook({ emblems: true })).toEqual({ emblems: true });
    expect(readReportLook({ emblems: false })).toEqual({ emblems: false });
    for (const bad of [{}, { emblems: 'yes' }, { emblems: true, colour: 'category' }, 'emblems', true, []]) {
      expect(readReportLook(bad), JSON.stringify(bad)).toEqual({ refused: expect.stringMatching(/\{ emblems: true \| false \}/) });
    }
  });
});
