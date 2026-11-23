/**
 * The Safety windows (D-RR, RR1; kit 5.1, 5.2): each window as it stood at the cursor, its state held to it; what the
 * layer draws of it (a fill by its weight, an outline while armed, history only while the cursor is inside a closed
 * one, never a drafted one); and the live reader's rules (the newest at an address; a refused one kept apart).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import drafted from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.drafted.json';
import armed from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.armed.json';
import live from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.live.json';
import closed from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.closed.json';
import vectors from '../../../psiWatch/kit-v0/vectors_rlsh.json';
import { inDefaultRange, windowsAt } from '../useSafetyWindows';
import { shapeOf } from '../../../../components/Globe/Hooks/useGlobeSafetyWindows';
import { acceptLiveRlsh, liveRlshRefused, resetLiveRlshForTests } from '../liveRlsh';
import type { RlshHeld } from '../useRlshItems';
import type { RlshNote } from '../recurrence';

const notes = [drafted, armed, live, closed].map((f) => f.event as RlshNote);
const held: RlshHeld = { notes: { recurrence_window: notes, recurrence_case: [], mission_totals: [], celebration_safety: [] }, refused: [], samples: true };
const FROM = 1812673800;
const PEAK = 1812687600;
const UNTIL = 1812701100;

describe('windowsAt', () => {
  it('shows each window as it stood at the cursor, its state held to it', () => {
    const before = windowsAt(held, armed.event.created_at + 60);
    expect(before).toHaveLength(1);
    expect(before[0].state).toBe('armed');
    // At its peak: the live note, live.
    expect(windowsAt(held, PEAK)[0].state).toBe('live');
    // A day after: the closed note, closed, with why.
    const after = windowsAt(held, UNTIL + 86_400);
    expect(after[0].state).toBe('closed');
    expect(after[0].window.closedBecause).toBe('passed');
  });

  it('keeps the next 14 days and the last 7 about the cursor by default', () => {
    const [s] = windowsAt(held, PEAK);
    expect(inDefaultRange(s.window, FROM - 13 * 86_400)).toBe(true);
    expect(inDefaultRange(s.window, FROM - 15 * 86_400)).toBe(false);
    expect(inDefaultRange(s.window, UNTIL + 6 * 86_400)).toBe(true);
    expect(inDefaultRange(s.window, UNTIL + 8 * 86_400)).toBe(false);
  });
});

describe('what the layer draws (kit 5.2)', () => {
  it('fills by the weight, outlines while armed, draws a closed one only with the cursor inside it, and never a drafted one', () => {
    const at = (s: number) => shapeOf(windowsAt(held, s)[0], s);
    expect(at(FROM - 3600)).toMatchObject({ fill: 0, outline: true, history: false });
    // At the live note's own peak (its buzzer 7 minutes late, the peak with it): the fullest fill.
    const livePeak = windowsAt(held, PEAK)[0].window.window.peak;
    expect(livePeak).toBe(PEAK + 420);
    expect(at(livePeak)).toMatchObject({ fill: 0.62, history: false });
    expect(at(UNTIL + 3600)).toBeNull();
    // A closed note, the cursor scrubbed back inside its window: history.
    const closedOnly: RlshHeld = { ...held, notes: { ...held.notes, recurrence_window: [closed.event as RlshNote] } };
    expect(shapeOf(windowsAt(closedOnly, PEAK)[0], PEAK)).toMatchObject({ history: true });
    // A drafted one is never on the globe.
    const draftedOnly: RlshHeld = { ...held, notes: { ...held.notes, recurrence_window: [drafted.event as RlshNote] } };
    expect(shapeOf(windowsAt(draftedOnly, FROM - 86_400 * 3)[0], FROM - 86_400 * 3)).toBeNull();
  });
});

describe('the live reader', () => {
  beforeEach(() => resetLiveRlshForTests());
  it('keeps a refused window apart with its reason, never as a window', () => {
    const finer = vectors.refusals.find((c) => c.case.startsWith('a point finer'))!.event as RlshNote;
    expect(acceptLiveRlsh(finer)).toBe(false);
    expect(liveRlshRefused()).toEqual([expect.objectContaining({ reason: 'rlsh-point-finer-than-city' })]);
  });
  it('keeps the newest at each address', () => {
    expect(acceptLiveRlsh(armed.event as RlshNote)).toBe(true);
    expect(acceptLiveRlsh(drafted.event as RlshNote)).toBe(false);
    expect(acceptLiveRlsh(live.event as RlshNote)).toBe(true);
  });
});
