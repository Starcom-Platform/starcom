import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRegisteredPoller } from '../useRegisteredPoller';
import { pollerRegistry } from '../../services/pollerRegistry';

describe('useRegisteredPoller — enabled gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not register a poller while enabled is false', () => {
    const key = 'test-poller-disabled';
    const fn = vi.fn();
    renderHook(() => useRegisteredPoller(key, fn, { intervalMs: 1000, enabled: false }));

    expect(pollerRegistry.isActive(key)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('registers a poller when enabled is true (default)', () => {
    const key = 'test-poller-enabled-default';
    const fn = vi.fn();
    const { unmount } = renderHook(() => useRegisteredPoller(key, fn, { intervalMs: 60_000, immediate: true }));

    expect(pollerRegistry.isActive(key)).toBe(true);
    unmount();
    expect(pollerRegistry.isActive(key)).toBe(false);
  });

  it('registers when toggled from disabled to enabled, and stops when toggled back off', () => {
    const key = 'test-poller-toggle';
    const fn = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useRegisteredPoller(key, fn, { intervalMs: 60_000, immediate: true, enabled }),
      { initialProps: { enabled: false } }
    );
    expect(pollerRegistry.isActive(key)).toBe(false);

    rerender({ enabled: true });
    expect(pollerRegistry.isActive(key)).toBe(true);

    rerender({ enabled: false });
    expect(pollerRegistry.isActive(key)).toBe(false);

    unmount();
  });

  it('the returned handle stays safe to call even while unregistered (disabled)', () => {
    const key = 'test-poller-safe-handle';
    const fn = vi.fn();
    const { result } = renderHook(() => useRegisteredPoller(key, fn, { intervalMs: 1000, enabled: false }));

    expect(() => result.current.stop()).not.toThrow();
    expect(() => result.current.runNow()).not.toThrow();
    expect(result.current.isActive()).toBe(false);
  });
});
