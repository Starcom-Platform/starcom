/**
 * Whether the window is a phone's (K2): 600 px wide or less, the width the
 * bar, the header and the Globe's corners change at.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePhone, PHONE_QUERY } from '../usePhone';

const stubMatchMedia = (initial: boolean) => {
  const listeners = new Set<() => void>();
  let matches = initial;
  const mql = {
    get matches() { return matches; },
    media: PHONE_QUERY,
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn); },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return { set(next: boolean) { matches = next; listeners.forEach((fn) => fn()); }, listeners };
};

afterEach(() => vi.unstubAllGlobals());

describe('usePhone', () => {
  it('asks for a window 600 px wide or less', () => {
    expect(PHONE_QUERY).toBe('(max-width: 600px)');
  });

  it('says whether the window is a phone, and follows it when it changes', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => usePhone());
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when it goes', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => usePhone());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
