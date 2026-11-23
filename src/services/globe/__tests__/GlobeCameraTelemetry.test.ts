import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globeCameraTelemetry } from '../GlobeCameraTelemetry';

// globeCameraTelemetry is a real module-level singleton (deliberately — see its own
// file for why), so these tests share state across cases in this file by design;
// each test publishes its own value rather than relying on a pristine initial state.
describe('globeCameraTelemetry', () => {
  it('notifies a new subscriber immediately with the current value', () => {
    globeCameraTelemetry.publish({ lat: 10, lng: 20, altitude: 2 });
    const listener = vi.fn();
    globeCameraTelemetry.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({ lat: 10, lng: 20, altitude: 2 });
  });

  it('notifies all active subscribers on publish', () => {
    const a = vi.fn();
    const b = vi.fn();
    globeCameraTelemetry.subscribe(a);
    globeCameraTelemetry.subscribe(b);

    globeCameraTelemetry.publish({ lat: 1, lng: 2, altitude: 3 });

    expect(a).toHaveBeenLastCalledWith({ lat: 1, lng: 2, altitude: 3 });
    expect(b).toHaveBeenLastCalledWith({ lat: 1, lng: 2, altitude: 3 });
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = globeCameraTelemetry.subscribe(listener);
    listener.mockClear();

    unsubscribe();
    globeCameraTelemetry.publish({ lat: 5, lng: 5, altitude: 5 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('getCurrent reflects the latest published value', () => {
    globeCameraTelemetry.publish({ lat: 42, lng: -71, altitude: 1.5 });
    expect(globeCameraTelemetry.getCurrent()).toEqual({ lat: 42, lng: -71, altitude: 1.5 });
  });
});
