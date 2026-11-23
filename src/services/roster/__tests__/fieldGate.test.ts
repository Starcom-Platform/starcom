/**
 * Going out, decided in one place (decision D-RS, RS37–RS40, RS47; the legal review of 2026-10-17): the NWS read
 * first, failing safe; then the age question; then the warning; then, for 13 to 17, daylight and a parent or
 * guardian. Darkness is the sun more than 6° below the horizon (civil twilight) anywhere in the window, at the
 * middle of each US state it names; where no place is known, a minor is told it is dark.
 */
import { describe, it, expect } from 'vitest';
import { fieldVerdict, sunAltitude, windowDark, placeMiddles } from '../fieldGate';
import type { AgeAnswer } from '../../identity/ageAnswer';

const age = (bracket: AgeAnswer['bracket']): AgeAnswer => ({ bracket, method: 'self_declared', at: '' });

describe('sunAltitude and windowDark', () => {
  const MN = { lat: 46.3, lng: -94.3 };
  it('reads the sun high at midday and below the horizon at midnight, local time', () => {
    expect(sunAltitude(MN.lat, MN.lng, Date.parse('2026-10-17T18:00:00Z'))).toBeGreaterThan(25);
    expect(sunAltitude(MN.lat, MN.lng, Date.parse('2026-10-17T06:00:00Z'))).toBeLessThan(-30);
  });

  it('says a window is dark if any of it is past civil twilight, light if all of it is not', () => {
    expect(windowDark({ from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' }, [MN])).toBe(true);
    expect(windowDark({ from: '2026-10-17T16:00Z', until: '2026-10-17T20:00Z' }, [MN])).toBe(false);
    // Light at its start, dark by its end.
    expect(windowDark({ from: '2026-10-17T20:00Z', until: '2026-10-18T02:00Z' }, [MN])).toBe(true);
    // Light at both ends, dark in the middle: overnight.
    expect(windowDark({ from: '2026-10-17T20:00Z', until: '2026-10-18T16:00Z' }, [MN])).toBe(true);
  });

  it('counts dusk past civil twilight as dark, before the sky is fully dark', () => {
    // At Minnesota's middle the sun is −0.7° at 23:30Z and −11.1° at 00:30Z: past −6°, short of −18°.
    expect(windowDark({ from: '2026-10-17T23:30Z', until: '2026-10-18T00:30Z' }, [MN])).toBe(true);
    expect(windowDark({ from: '2026-10-17T23:00Z', until: '2026-10-17T23:30Z' }, [MN])).toBe(false);
  });

  it('does not know without a place, or a window with both ends', () => {
    expect(windowDark({ from: '2026-10-17T16:00Z', until: '2026-10-17T20:00Z' }, [])).toBeNull();
    expect(windowDark(undefined, [MN])).toBeNull();
  });

  it('finds the middle of each US state named, and none for anywhere else', () => {
    expect(placeMiddles(['us-mn', 'ca', 'union:eu', 'us-zz'])).toEqual([{ lat: 46.3, lng: -94.3 }]);
  });
});

describe('fieldVerdict', () => {
  const base = { age: age('18_plus'), warningAgreed: true, parentTicked: false, dark: false as boolean | null, nws: 'read' as const };

  it('waits on the NWS, and pauses when it cannot be read: failing safe', () => {
    expect(fieldVerdict({ ...base, nws: 'reading' })).toEqual({ kind: 'no', reason: 'Reading the National Weather Service\'s warnings first.' });
    expect(fieldVerdict({ ...base, nws: 'unread' })).toEqual({ kind: 'no', reason: 'The National Weather Service could not be read here, so field trials are paused until it can be.' });
    expect(fieldVerdict({ ...base, nws: 'none' }).kind).toBe('yes');
  });

  it('asks the age, then the warning, before anything else', () => {
    expect(fieldVerdict({ ...base, age: null })).toEqual({ kind: 'ask_age' });
    expect(fieldVerdict({ ...base, warningAgreed: false })).toEqual({ kind: 'ask_warning' });
  });

  it('never under 13, nor for an AI agent, and asks neither the warning', () => {
    expect(fieldVerdict({ ...base, age: age('under_13'), warningAgreed: false })).toEqual({ kind: 'no', reason: 'Not for anyone under 13. Desk trials, and the way from home, are open to you.' });
    expect(fieldVerdict({ ...base, age: age('ai_agent'), warningAgreed: false })).toEqual({ kind: 'no', reason: 'An AI agent does not go out: field trials are for the person it guides, who answers for themselves.' });
  });

  it('13 to 17: not after dark, nor where dark is not known; in daylight, with a parent or guardian', () => {
    for (const bracket of ['13_15', '16_17'] as const) {
      expect(fieldVerdict({ ...base, age: age(bracket), dark: true })).toEqual({ kind: 'no', reason: 'After dark: not for anyone under 18.' });
      expect(fieldVerdict({ ...base, age: age(bracket), dark: null })).toEqual({ kind: 'no', reason: 'After dark: not for anyone under 18.' });
      expect(fieldVerdict({ ...base, age: age(bracket), dark: false })).toEqual({ kind: 'needs_parent' });
      expect(fieldVerdict({ ...base, age: age(bracket), dark: false, parentTicked: true })).toEqual({ kind: 'yes' });
    }
  });

  it('18 or over: yes, day or night', () => {
    expect(fieldVerdict({ ...base, dark: true })).toEqual({ kind: 'yes' });
  });
});
