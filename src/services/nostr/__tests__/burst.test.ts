/**
 * A burst of notes, told once: asked often within BURST_MS, it tells once; told now, it tells at once and nothing
 * waits after.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { burst, BURST_MS } from '../burst';

afterEach(() => { vi.useRealTimers(); });

describe('burst', () => {
  it('tells once for many asks within its time', () => {
    vi.useFakeTimers();
    const tell = vi.fn();
    const b = burst(tell);
    for (let i = 0; i < 500; i++) b.soon();
    expect(tell).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BURST_MS);
    expect(tell).toHaveBeenCalledTimes(1);
    b.soon();
    vi.advanceTimersByTime(BURST_MS);
    expect(tell).toHaveBeenCalledTimes(2);
  });

  it('tells now at once, and nothing is left waiting', () => {
    vi.useFakeTimers();
    const tell = vi.fn();
    const b = burst(tell);
    b.soon();
    b.now();
    expect(tell).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(BURST_MS * 2);
    expect(tell).toHaveBeenCalledTimes(1);
  });
});
