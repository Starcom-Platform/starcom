import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initLongTaskMonitoring, stopLongTaskMonitoring } from '../performanceMonitor';

// jsdom doesn't implement the Long Tasks API, so PerformanceObserver /
// its supportedEntryTypes are mocked here to exercise both branches
// (supported vs. unsupported browser) deterministically.
class MockPerformanceObserver {
  static supportedEntryTypes: string[] = ['longtask'];
  static instances: MockPerformanceObserver[] = [];
  callback: (list: { getEntries: () => unknown[] }) => void;
  observeArgs: unknown;
  disconnected = false;

  constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
    this.callback = callback;
    MockPerformanceObserver.instances.push(this);
  }

  observe(options: unknown) {
    this.observeArgs = options;
  }

  disconnect() {
    this.disconnected = true;
  }

  emit(entries: unknown[]) {
    this.callback({ getEntries: () => entries });
  }
}

describe('initLongTaskMonitoring / stopLongTaskMonitoring', () => {
  const originalPO = globalThis.PerformanceObserver;

  beforeEach(() => {
    MockPerformanceObserver.instances = [];
    MockPerformanceObserver.supportedEntryTypes = ['longtask'];
    (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = MockPerformanceObserver;
  });

  afterEach(() => {
    stopLongTaskMonitoring();
    (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = originalPO;
  });

  it('registers a longtask observer when the browser supports it', () => {
    initLongTaskMonitoring();

    expect(MockPerformanceObserver.instances.length).toBe(1);
    expect(MockPerformanceObserver.instances[0].observeArgs).toEqual({ type: 'longtask', buffered: true });
  });

  it('is a no-op (no observer created) when the browser does not support the longtask entry type', () => {
    MockPerformanceObserver.supportedEntryTypes = ['paint', 'resource'];

    initLongTaskMonitoring();

    expect(MockPerformanceObserver.instances.length).toBe(0);
  });

  it('does not create a second observer on a repeated call (idempotent)', () => {
    initLongTaskMonitoring();
    initLongTaskMonitoring();

    expect(MockPerformanceObserver.instances.length).toBe(1);
  });

  it('stopLongTaskMonitoring disconnects the observer and allows a fresh one to be created afterward', () => {
    initLongTaskMonitoring();
    const first = MockPerformanceObserver.instances[0];

    stopLongTaskMonitoring();
    expect(first.disconnected).toBe(true);

    initLongTaskMonitoring();
    expect(MockPerformanceObserver.instances.length).toBe(2);
  });

  it('processes emitted longtask entries without throwing', () => {
    initLongTaskMonitoring();
    const observer = MockPerformanceObserver.instances[0];

    expect(() => {
      observer.emit([
        { duration: 60, startTime: 1000, name: 'self' },
        { duration: 200, startTime: 2000, name: 'same-origin-descendant' }
      ]);
    }).not.toThrow();
  });
});
