import { useEffect, useRef } from 'react';
import { pollerRegistry, type PollerFn, type PollerHandle, type PollerOptions } from '../services/pollerRegistry';

interface UseRegisteredPollerOptions extends PollerOptions {
  deps?: unknown[];
  /** Skips registration entirely while false (default true) — the idiomatic way for a
   * toggleable overlay/layer to drive its own poller lifecycle from the same `enabled`
   * flag it already uses to gate rendering, rather than always registering and relying on
   * the poller fn itself to no-op. pollerRegistry's stop/runNow/isActive are all safe
   * no-ops against an unregistered key, so the returned handle stays safe to call either way. */
  enabled?: boolean;
}

export const useRegisteredPoller = (
  key: string,
  fn: PollerFn,
  options: UseRegisteredPollerOptions,
): PollerHandle => {
  const savedFn = useRef(fn);
  savedFn.current = fn;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const handle = pollerRegistry.register(key, (signal) => savedFn.current(signal), options);
    return () => handle.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...(options.deps ?? [])]);

  return {
    key,
    scope: Array.isArray(options.scope) ? options.scope.join(',') : options.scope,
    stop: () => pollerRegistry.stop(key),
    runNow: () => pollerRegistry.runNow(key),
    isActive: () => pollerRegistry.isActive(key),
  };
};
