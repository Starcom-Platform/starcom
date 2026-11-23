/**
 * Which War & Conflict items are new to this browser (D-GV W4): since its last visit, or arrived while it is open.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { newSinceS, noteWarConflictRead, resetWarConflictSeenForTests } from '../warConflictSeen';

const KEY = 'starcom.warConflict.seenUntil';
const item = (id: string, reportedAt: number) => ({ id, reportedAt });

describe('newSinceS', () => {
  beforeEach(() => { localStorage.clear(); resetWarConflictSeenForTests(); });

  it('on a first visit, counts nothing new until The Record has sent what it holds, then only what arrives after', () => {
    expect(newSinceS(item('a', 2_000_000_000))).toBe(-1);
    noteWarConflictRead([item('a', 1), item('b', 2)], false);
    expect(newSinceS(item('b', 2))).toBe(-1);
    noteWarConflictRead([item('a', 1), item('b', 2)], true);
    expect(newSinceS(item('a', 1))).toBe(-1);
    expect(newSinceS(item('c', 3))).toBeGreaterThanOrEqual(0);
  });

  it('counts an item reported after the last visit new, and keeps the moment it first did', async () => {
    localStorage.setItem(KEY, '1000');
    expect(newSinceS(item('old', 999))).toBe(-1);
    const first = newSinceS(item('fresh', 1001));
    expect(first).toBeGreaterThanOrEqual(0);
    await new Promise((r) => setTimeout(r, 5));
    expect(newSinceS(item('fresh', 1001))).toBe(first);
  });

  it('remembers this visit as the browser leaves the page', () => {
    noteWarConflictRead([], true);
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Number(localStorage.getItem(KEY))).toBeGreaterThan(1_700_000_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
});
