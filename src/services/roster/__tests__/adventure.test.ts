/**
 * An Adventure (decision D-RS, RS10, RS33–RS36): a call over missions, on a clock; called off by its caller or its
 * window; taken away from home only after the age question, answered once and kept on the device with how it was
 * given; its return, seen or not, sealed to its caller, naming the call.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GOING_OUT_AGREEMENT, GOING_OUT_WARNING, GOING_OUT_WARNING_VERSION, SAFETY_RULES, adventureState, agreeToWarning,
  recordReturn, returnOf, returnTemplate, warningAgreed, windowMs, adventureTotals, resetAdventures,
} from '../adventure';
import { MissionTotalsStore } from '../missionTotals';

const at = (iso: string) => Date.parse(iso);
const WINDOW = { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' };

describe('windowMs', () => {
  it('reads a window of times, and a day as the whole UTC day', () => {
    expect(windowMs(WINDOW)).toEqual({ from: at('2026-10-17T02:00Z'), until: at('2026-10-17T09:00Z') });
    expect(windowMs({ from: '2026-10-17', until: '2026-10-18' })).toEqual({ from: at('2026-10-17T00:00Z'), until: at('2026-10-19T00:00Z') });
    expect(windowMs({ from: '', until: '2026-10-18' })).toBeNull();
  });
});

describe('adventureState', () => {
  // Plain times, never a countdown: nothing that hurries anyone out at night (Lemmon v. Snap; RS37).
  it('says when it starts, that it is on until when, and when it is over', () => {
    expect(adventureState({ window: WINDOW }, at('2026-10-16T20:00Z'))).toEqual({ state: 'coming', text: 'Starts 2026-10-17 02:00 Z' });
    expect(adventureState({ window: WINDOW }, at('2026-10-17T03:30Z'))).toEqual({ state: 'on', text: 'On now, until 2026-10-17 09:00 Z' });
    expect(adventureState({ window: WINDOW }, at('2026-10-17T09:00Z'))).toEqual({ state: 'over', text: 'Over: its window closed.' });
    expect(adventureState({ window: { from: '2026-10-17', until: '2026-10-18' } }, at('2026-10-16T12:00Z')).text).toBe('Starts 2026-10-17');
  });

  it('is called off by its caller, the date and why quoted, whatever its clock says', () => {
    expect(adventureState({ window: WINDOW, ended: { date: '2026-10-17', why: 'Clouds over the whole state.' } }, at('2026-10-17T03:00Z')))
      .toEqual({ state: 'called_off', text: 'Called off 2026-10-17 by its caller: Clouds over the whole state.' });
    expect(adventureState({ window: WINDOW, ended: { date: '2026-10-17', why: '' } }, at('2026-10-17T03:00Z')).text).toBe('Called off 2026-10-17 by its caller.');
  });

  it('is called off by the authority everywhere it names, quoting the warning', () => {
    expect(adventureState({ window: WINDOW }, at('2026-10-17T03:00Z'), 'the NWS: Blizzard Warning for Minnesota, until 2026-10-17 18:00 Z'))
      .toEqual({ state: 'called_off', text: 'Called off by the NWS: Blizzard Warning for Minnesota, until 2026-10-17 18:00 Z' });
  });
});

describe('SAFETY_RULES', () => {
  it('states the rules every adventure keeps, each short', () => {
    expect(SAFETY_RULES.length).toBeGreaterThanOrEqual(5);
    expect(SAFETY_RULES.join(' ')).toMatch(/driving/);
    expect(SAFETY_RULES.join(' ')).toMatch(/Public, lawful places only/);
    for (const rule of SAFETY_RULES) expect(rule.split(/\s+/).length).toBeLessThanOrEqual(20);
  });
});

describe('the warning (RS38)', () => {
  beforeEach(() => { resetAdventures(); });

  it('is agreed to once, by its version, and asked again when its text changes', () => {
    expect(warningAgreed()).toBe(false);
    agreeToWarning(at('2026-10-17T15:00Z'));
    expect(warningAgreed()).toBe(true);
    expect(JSON.parse(localStorage.getItem('starcom.adventures.v1') ?? '{}').warning).toEqual({ version: GOING_OUT_WARNING_VERSION, at: '2026-10-17T15:00:00.000Z' });
    expect(warningAgreed(GOING_OUT_WARNING_VERSION + 1)).toBe(false);
  });

  it('names the callers as people or AI agents, never independent, and promises no safety', () => {
    const text = GOING_OUT_WARNING.join(' ');
    expect(text).toMatch(/people or AI agents/);
    expect(text).not.toMatch(/independent/i);
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(text).toMatch(/responsible for your own safety/);
  });

  // The legal review of 2026-10-17: a release names who is released and says "negligence"; places open at the hour.
  it('version 2 releases Starcom and its maker from negligence claims, as far as the law allows, and asks again', () => {
    expect(GOING_OUT_WARNING_VERSION).toBe(2);
    const text = GOING_OUT_WARNING.join(' ');
    expect(text).toMatch(/As far as the law allows, you release Starcom and its maker from claims arising from taking part, including negligence\./);
    expect(text).toMatch(/Public places only, while they are open/);
    expect(GOING_OUT_AGREEMENT).toBe('I have read this. I go at my own risk, and I agree to the release above.');
  });
});

describe('returnTemplate', () => {
  it('names the call, says seen or not with the counts given, and the day only, in NavCom\'s report form (MX28)', () => {
    const t = returnTemplate({ address: `30084:${'a'.repeat(64)}:adventure-aurora`, seen: true, counts: [{ label: 'Photos taken', n: 3 }], day: '2026-10-17', callsign: 'Nightjar', salt: 'f'.repeat(32) });
    expect(t.kind).toBe(1912);
    expect(t.tags).toEqual([['a', `30084:${'a'.repeat(64)}:adventure-aurora`]]);
    expect(t.content).toBe(JSON.stringify({ callsign: 'Nightjar', date: '2026-10-17', seen: true, counts: [{ line: 'Photos taken', n: 3 }], salt: 'f'.repeat(32) }));
    expect(t.given).toEqual([{ label: 'Photos taken', n: 3 }]);
    expect(t.createdAt).toBe(at('2026-10-17T00:00Z') / 1000);
    const unseen = returnTemplate({ address: 'x', seen: false, counts: [], day: '2026-10-17' });
    expect(JSON.parse(unseen.content)).toMatchObject({ seen: false, counts: [] });
    // No callsign set: the signer's key stands as author, and none is written (callsign.ts).
    expect(JSON.parse(unseen.content)).not.toHaveProperty('callsign');
    // A fresh salt each time, so two returns of the same day never share an id inside the seal.
    expect(JSON.parse(unseen.content).salt).not.toBe(JSON.parse(returnTemplate({ address: 'x', seen: false, counts: [], day: '2026-10-17' }).content).salt);
  });
});

describe('returns sent, kept on the device', () => {
  beforeEach(() => { resetAdventures(); });
  it('keeps the last one sent for each adventure', () => {
    const address = `30084:${'a'.repeat(64)}:adventure-aurora`;
    expect(returnOf(address)).toBeUndefined();
    recordReturn(address, { seen: false, day: '2026-10-17', relays: 2 });
    recordReturn(address, { seen: true, day: '2026-10-17', relays: 3 });
    expect(returnOf(address)).toEqual({ seen: true, day: '2026-10-17', relays: 3 });
  });
});

describe('adventureTotals', () => {
  const CALLER = 'c'.repeat(64);
  const address = `30084:${CALLER}:adventure-aurora`;
  const note = (pubkey: string, tags: string[][]) => ({ id: 'x'.repeat(64), kind: 30023, pubkey, created_at: 10, content: '', sig: '', tags });

  it('reads its caller\'s posted totals, seen and not, rounded down and a day late', () => {
    const store = new MissionTotalsStore();
    store.accept(note(CALLER, [['d', 'mission-totals-adventure-aurora'], ['t', 'mission_totals'], ['a', address], ['total', 'Seen', '134'], ['total', 'Not seen', '47'], ['as_of', '2026-10-17']]));
    expect(adventureTotals(address, store, '2026-10-18')).toEqual({ seen: 100, notSeen: 40, asOf: '2026-10-17' });
    expect(adventureTotals(address, store, '2026-10-17')).toBeNull();
  });

  it('counts no one else\'s totals for it', () => {
    const store = new MissionTotalsStore();
    store.accept(note('d'.repeat(64), [['t', 'mission_totals'], ['a', address], ['total', 'Seen', '999'], ['as_of', '2026-10-16']]));
    expect(adventureTotals(address, store, '2026-10-18')).toBeNull();
  });
});
