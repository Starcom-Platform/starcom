/**
 * The hint that must never become a persistent nag: dismissed by the first
 * real interaction, or a timeout, whichever comes first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { useGlobeNavHint } from '../useGlobeNavHint';

const containerWith = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ref = createRef<HTMLDivElement>();
  // @ts-expect-error — RefObject.current is readonly at the type level; the
  // hook is given a real DOM node the way React's own ref callback would.
  ref.current = el;
  return { el, ref };
};

describe('useGlobeNavHint', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows on mount', () => {
    const { ref } = containerWith();
    const { result } = renderHook(() => useGlobeNavHint(ref));
    expect(result.current.showNavHint).toBe(true);
  });

  it('dismisses on the container\'s first pointerdown', () => {
    const { el, ref } = containerWith();
    const { result } = renderHook(() => useGlobeNavHint(ref));

    act(() => { el.dispatchEvent(new Event('pointerdown')); });

    expect(result.current.showNavHint).toBe(false);
  });

  it('dismisses on the container\'s first wheel event', () => {
    const { el, ref } = containerWith();
    const { result } = renderHook(() => useGlobeNavHint(ref));

    act(() => { el.dispatchEvent(new Event('wheel')); });

    expect(result.current.showNavHint).toBe(false);
  });

  it('dismisses after 8 seconds with no interaction', () => {
    const { ref } = containerWith();
    const { result } = renderHook(() => useGlobeNavHint(ref));

    act(() => { vi.advanceTimersByTime(8000); });

    expect(result.current.showNavHint).toBe(false);
  });

  it('does not dismiss a moment before the timeout', () => {
    const { ref } = containerWith();
    const { result } = renderHook(() => useGlobeNavHint(ref));

    act(() => { vi.advanceTimersByTime(7999); });

    expect(result.current.showNavHint).toBe(true);
  });

  it('never comes back once dismissed, even if the container remounts', () => {
    // Regression shape for the real bug this hint exists to avoid: it must
    // stay dismissed rather than reappearing and becoming a persistent nag.
    const { el, ref } = containerWith();
    const { result, rerender } = renderHook(() => useGlobeNavHint(ref));

    act(() => { el.dispatchEvent(new Event('pointerdown')); });
    expect(result.current.showNavHint).toBe(false);

    rerender();
    expect(result.current.showNavHint).toBe(false);
  });

  it('cleans up its listeners and timer on unmount', () => {
    const { el, ref } = containerWith();
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    const { unmount } = renderHook(() => useGlobeNavHint(ref));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
  });

  it('does nothing if the container ref has no node yet', () => {
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useGlobeNavHint(ref));
    // No node to attach listeners to; the hint state itself is still whatever
    // it starts as — the hook should not throw.
    expect(result.current.showNavHint).toBe(true);
  });
});
