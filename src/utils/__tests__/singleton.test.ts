import React, { StrictMode } from 'react';
import { vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getSingleton, resetSingleton, useSingleton } from '../singleton';

describe('singleton utilities', () => {
  beforeEach(() => {
    resetSingleton('test-key');
    resetSingleton('hot-reload-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSingleton('test-key');
    resetSingleton('hot-reload-key');
  });

  it('dedupes factory calls with getSingleton', () => {
    const factory = vi.fn(() => ({ id: 'only-one' }));
    const first = getSingleton('test-key', factory);
    const second = getSingleton('test-key', factory);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('warns once on reuse when enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const factory = vi.fn(() => ({ id: 'warned' }));

    getSingleton('test-key', factory, { warnOnReuse: true });
    getSingleton('test-key', factory, { warnOnReuse: true });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('keeps singleton across StrictMode double render via useSingleton', () => {
    const factory = vi.fn(() => ({ id: 'strict-singleton' }));
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(StrictMode, null, children);

    const { result, rerender } = renderHook(() => useSingleton('test-key', factory), { wrapper });
    rerender();

    expect(result.current.id).toBe('strict-singleton');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('survives hot-reload style remount without recreating instance', () => {
    const factoryA = vi.fn(() => ({ id: 'original' }));
    const factoryB = vi.fn(() => ({ id: 'should-not-run' }));

    const { unmount } = renderHook(() => useSingleton('hot-reload-key', factoryA));
    unmount();
    const { result: second } = renderHook(() => useSingleton('hot-reload-key', factoryB));

    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).not.toHaveBeenCalled();
    expect(second.current.id).toBe('original');
  });
});
