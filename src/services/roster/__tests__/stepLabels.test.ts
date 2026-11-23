/**
 * Tasks together (decision D-RS, RS15; the owner's RS55–RS57, 2026-10-18): when a team works a mission, each step
 * is taken, released, done and checked by NIP-32 labels in `starcom.step` on the team's own relay. A taken step
 * holds for 24 hours at most, or until released; while one member holds it no other takes it; the first done
 * stands; and only someone other than the one who did it checks it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { STEP_HOLD_S, STEP_NAMESPACE, readStepLabel, stepBoard, stepLabelTemplate, watchStepLabels, type StepLabel } from '../stepLabels';

const MISSION = `30079:${'a'.repeat(64)}:starcom_mission_package_swifts`;
const YOU = 'b'.repeat(64);
const SAM = 'c'.repeat(64);
const ALEX = 'd'.repeat(64);
const T = 1_792_300_000;

const label = (pubkey: string, value: StepLabel['value'], at: number, step = 's1', more: Partial<StepLabel> = {}): StepLabel => ({
  id: `${pubkey.slice(0, 4)}-${value}-${at}`, pubkey, value, coordinate: MISSION, step, createdAt: at,
  ...(value === 'taken' ? { expiresAt: at + STEP_HOLD_S } : {}), ...more,
});

describe('a step label', () => {
  it('is a NIP-32 label in starcom.step naming the mission and the step; a take expires in 24 hours', () => {
    const t = stepLabelTemplate({ value: 'taken', coordinate: MISSION, step: 's1', nowS: T });
    expect(t).toEqual({
      kind: 1985,
      tags: [['L', STEP_NAMESPACE], ['l', 'taken', STEP_NAMESPACE], ['a', MISSION], ['step', 's1'], ['expiration', String(T + 86_400)]],
      content: '',
    });
    expect(STEP_HOLD_S).toBe(86_400);
  });

  it('names whose done a check checks, and carries its note', () => {
    const t = stepLabelTemplate({ value: 'checked', coordinate: MISSION, step: 's1', doer: SAM, note: 'Counted again: 212.', nowS: T });
    expect(t.tags).toEqual([['L', STEP_NAMESPACE], ['l', 'checked', STEP_NAMESPACE], ['a', MISSION], ['step', 's1'], ['p', SAM]]);
    expect(t.content).toBe('Counted again: 212.');
  });

  it('is read back, and refused when it is not one, names no step, or a check names no doer', () => {
    const event = (tags: string[][], content = '') => ({ id: 'e1', pubkey: YOU, kind: 1985, created_at: T, tags, content, sig: '' });
    const taken = stepLabelTemplate({ value: 'taken', coordinate: MISSION, step: 's1', nowS: T });
    expect(readStepLabel(event(taken.tags), T)).toEqual({ id: 'e1', pubkey: YOU, value: 'taken', coordinate: MISSION, step: 's1', createdAt: T, expiresAt: T + 86_400 });
    expect(readStepLabel(event(taken.tags.filter((t) => t[0] !== 'step')), T)).toBeNull();
    expect(readStepLabel(event(taken.tags.map((t) => (t[0] === 'l' ? ['l', 'claimed', STEP_NAMESPACE] : t))), T)).toBeNull();
    expect(readStepLabel(event(taken.tags.map((t) => (t[0] === 'L' ? ['L', 'navcom.mission'] : t))), T)).toBeNull();
    const check = stepLabelTemplate({ value: 'checked', coordinate: MISSION, step: 's1', doer: SAM, nowS: T });
    expect(readStepLabel(event(check.tags.filter((t) => t[0] !== 'p')), T)).toBeNull();
    expect(readStepLabel(event(check.tags, 'Fine.'), T)).toMatchObject({ value: 'checked', doer: SAM, note: 'Fine.' });
  });
});

describe('the board', () => {
  it('a step no one has taken is open', () => {
    expect(stepBoard([], ['s1'], T)).toEqual({ s1: { state: 'open' } });
  });

  it('a step taken is held by its taker for 24 hours, and no one else takes it meanwhile', () => {
    const board = stepBoard([label(YOU, 'taken', T), label(SAM, 'taken', T + 60)], ['s1'], T + 120);
    expect(board.s1).toEqual({ state: 'taken', by: YOU, until: T + STEP_HOLD_S });
  });

  it('frees itself after 24 hours, and then another may take it', () => {
    expect(stepBoard([label(YOU, 'taken', T)], ['s1'], T + STEP_HOLD_S).s1).toEqual({ state: 'open' });
    const board = stepBoard([label(YOU, 'taken', T), label(SAM, 'taken', T + STEP_HOLD_S + 1)], ['s1'], T + STEP_HOLD_S + 2);
    expect(board.s1).toEqual({ state: 'taken', by: SAM, until: T + 2 * STEP_HOLD_S + 1 });
  });

  it('holds no longer than 24 hours whatever expiry a take states', () => {
    const long = label(YOU, 'taken', T, 's1', { expiresAt: T + 10 * STEP_HOLD_S });
    expect(stepBoard([long], ['s1'], T + STEP_HOLD_S).s1).toEqual({ state: 'open' });
  });

  it('is freed sooner when its taker releases it, and renewed when taken again', () => {
    expect(stepBoard([label(YOU, 'taken', T), label(YOU, 'released', T + 10)], ['s1'], T + 20).s1).toEqual({ state: 'open' });
    // Released by someone else: no effect.
    expect(stepBoard([label(YOU, 'taken', T), label(SAM, 'released', T + 10)], ['s1'], T + 20).s1).toMatchObject({ state: 'taken', by: YOU });
    expect(stepBoard([label(YOU, 'taken', T), label(YOU, 'taken', T + 3600)], ['s1'], T + 3700).s1).toEqual({ state: 'taken', by: YOU, until: T + 3600 + STEP_HOLD_S });
  });

  it('done by its taker, or by anyone while it is open; never by another while it is held', () => {
    expect(stepBoard([label(YOU, 'taken', T), label(YOU, 'done', T + 10)], ['s1'], T + 20).s1).toEqual({ state: 'done', by: YOU, at: T + 10 });
    expect(stepBoard([label(SAM, 'done', T)], ['s1'], T + 20).s1).toEqual({ state: 'done', by: SAM, at: T });
    expect(stepBoard([label(YOU, 'taken', T), label(SAM, 'done', T + 10)], ['s1'], T + 20).s1).toMatchObject({ state: 'taken', by: YOU });
    // The first done stands.
    expect(stepBoard([label(SAM, 'done', T), label(ALEX, 'done', T + 5)], ['s1'], T + 20).s1).toMatchObject({ state: 'done', by: SAM });
  });

  it('checked only by someone other than the one who did it, naming that done', () => {
    const done = [label(SAM, 'taken', T), label(SAM, 'done', T + 10)];
    expect(stepBoard([...done, label(YOU, 'checked', T + 20, 's1', { doer: SAM, note: 'Counted again: 212.' })], ['s1'], T + 30).s1)
      .toEqual({ state: 'checked', by: SAM, at: T + 10, checkedBy: YOU, note: 'Counted again: 212.' });
    expect(stepBoard([...done, label(SAM, 'checked', T + 20, 's1', { doer: SAM })], ['s1'], T + 30).s1).toMatchObject({ state: 'done', by: SAM });
    // A check naming someone else's done, or of a step not done, is nothing.
    expect(stepBoard([...done, label(YOU, 'checked', T + 20, 's1', { doer: ALEX })], ['s1'], T + 30).s1).toMatchObject({ state: 'done', by: SAM });
    expect(stepBoard([label(YOU, 'checked', T, 's1', { doer: SAM })], ['s1'], T + 30).s1).toEqual({ state: 'open' });
  });

  it('keeps each step apart, and reads them in the order they were signed', () => {
    const board = stepBoard([label(SAM, 'done', T + 10, 's2'), label(YOU, 'taken', T, 's1'), label(ALEX, 'taken', T - 5, 's1')], ['s1', 's2', 's3'], T + 20);
    expect(board).toEqual({
      s1: { state: 'taken', by: ALEX, until: T - 5 + STEP_HOLD_S },
      s2: { state: 'done', by: SAM, at: T + 10 },
      s3: { state: 'open' },
    });
  });
});

describe('watching a team\'s relay', () => {
  it('asks the team\'s relay alone for the mission\'s labels, tells each new one, says when it has read them, and closes', () => {
    type H = { onevent: (e: unknown) => void; oneose: () => void };
    let handlers: H | undefined;
    const close = () => { closed = true; };
    let closed = false;
    const subscribeMany = (relays: string[], filter: unknown, h: H) => { asked = { relays, filter }; handlers = h; return { close }; };
    let asked: { relays: string[]; filter: unknown } | undefined;
    const told: number[] = [];
    let read = false;
    const stop = watchStepLabels('wss://team.example.org', MISSION, { onLabels: (l) => told.push(l.length), onRead: () => { read = true; } },
      { subscribeMany } as never, () => T);
    expect(asked).toEqual({ relays: ['wss://team.example.org'], filter: { kinds: [1985], '#L': [STEP_NAMESPACE], '#a': [MISSION] } });
    const taken = stepLabelTemplate({ value: 'taken', coordinate: MISSION, step: 's1', nowS: T });
    const event = { id: 'e1', pubkey: YOU, kind: 1985, created_at: T, sig: '', ...taken };
    handlers!.onevent(event);
    handlers!.onevent(event);
    // Another mission's, or not a step label: nothing.
    handlers!.onevent({ ...event, id: 'e2', tags: taken.tags.map((t) => (t[0] === 'a' ? ['a', `30079:${'f'.repeat(64)}:other`] : t)) });
    handlers!.onevent({ ...event, id: 'e3', kind: 1 });
    expect(told).toEqual([1]);
    handlers!.oneose();
    expect(read).toBe(true);
    stop();
    expect(closed).toBe(true);
  });
});


describe('what a team is working on', () => {
  it('each mission its members label, how many of them, newest first', async () => {
    const { teamMissionsOf } = await import('../stepLabels');
    const OTHER = `30079:${'e'.repeat(64)}:starcom_mission_package_gauges`;
    // The older mission's label first: the order is the work's, not the relay's.
    const missions = teamMissionsOf([
      { ...label(ALEX, 'taken', T + 5, 's1'), coordinate: OTHER },
      label(YOU, 'taken', T, 's1'), label(SAM, 'done', T + 10, 's2'), label(SAM, 'taken', T + 20, 's3'),
    ]);
    expect(missions).toEqual([{ coordinate: MISSION, members: 2, lastAt: T + 20 }, { coordinate: OTHER, members: 1, lastAt: T + 5 }]);
  });

  it('asks a team\'s relay for every step label, whichever mission', () => {
    let asked: unknown;
    const subscribeMany = (_r: string[], filter: unknown) => { asked = filter; return { close: () => {} }; };
    const stop = watchStepLabels('wss://team.example.org', null, { onLabels: () => {} }, { subscribeMany } as never, () => T);
    expect(asked).toEqual({ kinds: [1985], '#L': [STEP_NAMESPACE] });
    stop();
  });
});
