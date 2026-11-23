/**
 * "How old are you?" (decision D-RS, RS37, RS39): asked neutrally, once, kept on this device with how it was given,
 * and locked. Under 13, Starcom makes no key and signs nothing, so nothing is posted. It is asked the first time a
 * key would be made, where something on screen can ask; where nothing can (a test, a script), nothing waits on it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { publishesAsAgent, setPublishesAsAgent } from '../callsign';
import {
  AGE_BRACKETS, AGE_CHOICES, UNDER_13_REFUSAL, ageAnswer, ageBeforeSigning, askAge, registerAgeAsker, resetAge, setAgeAnswer, subscribeAge,
} from '../ageAnswer';

const at = (iso: string) => Date.parse(iso);

beforeEach(() => { resetAge(); registerAgeAsker(null); });

describe('the answer', () => {
  it('is asked neutrally: four brackets, as AB 1043 and Google\'s age signal have them', () => {
    expect(AGE_BRACKETS.map((b) => [b.bracket, b.label])).toEqual([
      ['under_13', 'Under 13'], ['13_15', '13 to 15'], ['16_17', '16 to 17'], ['18_plus', '18 or over'],
    ]);
  });

  it('is kept once, with how it was given, locked, and tells who listens', () => {
    let told = 0;
    const stop = subscribeAge(() => { told += 1; });
    expect(setAgeAnswer('16_17', at('2026-10-17T15:00Z'))).toBe(true);
    expect(ageAnswer()).toEqual({ bracket: '16_17', method: 'self_declared', at: '2026-10-17T15:00:00.000Z' });
    expect(JSON.parse(localStorage.getItem('starcom.age.v1') ?? 'null')).toEqual({ bracket: '16_17', method: 'self_declared', at: '2026-10-17T15:00:00.000Z' });
    expect(setAgeAnswer('18_plus')).toBe(false);
    expect(ageAnswer()?.bracket).toBe('16_17');
    expect(told).toBe(1);
    stop();
  });
});

describe('an AI agent (RS42)', () => {
  it('answers that it is one, and its key then says it is an agent\'s', () => {
    expect(AGE_CHOICES.map((c) => c.label)).toEqual(['Under 13', '13 to 15', '16 to 17', '18 or over', 'I am an AI agent']);
    setPublishesAsAgent(false);
    expect(setAgeAnswer('ai_agent')).toBe(true);
    expect(ageAnswer()?.bracket).toBe('ai_agent');
    expect(publishesAsAgent()).toBe(true);
    setPublishesAsAgent(false);
  });

  it('is not refused a key: it is not a minor', async () => {
    setAgeAnswer('ai_agent');
    expect(await ageBeforeSigning(true)).toEqual({ ok: true });
  });
});

describe('askAge', () => {
  it('asks whatever is on screen to ask, and answers with what was kept', async () => {
    registerAgeAsker(async () => { setAgeAnswer('18_plus'); return ageAnswer(); });
    expect(await askAge()).toMatchObject({ bracket: '18_plus' });
  });

  it('answers at once with what is kept, asking nothing', async () => {
    setAgeAnswer('13_15');
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; return null; });
    expect(await askAge()).toMatchObject({ bracket: '13_15' });
    expect(asked).toBe(0);
  });

  it('answers null when nothing can ask', async () => {
    expect(await askAge()).toBeNull();
  });
});

describe('ageBeforeSigning', () => {
  it('refuses anyone who said under 13, a first key or not', async () => {
    setAgeAnswer('under_13');
    expect(await ageBeforeSigning(true)).toEqual({ ok: false, reason: UNDER_13_REFUSAL });
    expect(await ageBeforeSigning(false)).toEqual({ ok: false, reason: UNDER_13_REFUSAL });
    expect(UNDER_13_REFUSAL).toBe('Starcom makes no key for anyone under 13, so nothing is posted. Everything kept on this device still works.');
  });

  it('asks before a first key, and goes on with the answer, or stops when none is given', async () => {
    registerAgeAsker(async () => { setAgeAnswer('16_17'); return ageAnswer(); });
    expect(await ageBeforeSigning(true)).toEqual({ ok: true });
    resetAge();
    registerAgeAsker(async () => null);
    expect(await ageBeforeSigning(true)).toEqual({ ok: false, cancelled: true });
    resetAge();
    registerAgeAsker(async () => { setAgeAnswer('under_13'); return ageAnswer(); });
    expect(await ageBeforeSigning(true)).toEqual({ ok: false, reason: UNDER_13_REFUSAL });
  });

  it('asks nothing when a key is already there, or when nothing can ask', async () => {
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; return null; });
    expect(await ageBeforeSigning(false)).toEqual({ ok: true });
    expect(asked).toBe(0);
    registerAgeAsker(null);
    expect(await ageBeforeSigning(true)).toEqual({ ok: true });
  });
});
