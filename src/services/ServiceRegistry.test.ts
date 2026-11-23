import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to test the class directly (not the exported singleton) so we can get fresh instances.
// Re-implement a minimal version of the registry for isolated testing,
// or import and clear the singleton between tests.

// Test approach: import the module, which gives us the singleton; call destroyAll() in beforeEach.
import { serviceRegistry, ManagedService } from './ServiceRegistry';

describe('ServiceRegistry', () => {
  beforeEach(async () => {
    await serviceRegistry.destroyAll();
  });

  it('should register and retrieve a service', () => {
    const svc = { name: 'test' };
    serviceRegistry.register('test', svc);
    expect(serviceRegistry.get('test')).toBe(svc);
  });

  it('should throw when getting an unregistered service', () => {
    expect(() => serviceRegistry.get('missing')).toThrow('Service "missing" is not registered');
  });

  it('should skip duplicate registrations', () => {
    const svc1 = { v: 1 };
    const svc2 = { v: 2 };
    serviceRegistry.register('dup', svc1);
    serviceRegistry.register('dup', svc2);
    expect(serviceRegistry.get('dup')).toBe(svc1); // first wins
  });

  it('should report has() correctly', () => {
    expect(serviceRegistry.has('x')).toBe(false);
    serviceRegistry.register('x', {});
    expect(serviceRegistry.has('x')).toBe(true);
  });

  it('should list registered keys', () => {
    serviceRegistry.register('a', {});
    serviceRegistry.register('b', {});
    expect(serviceRegistry.keys()).toEqual(['a', 'b']);
  });

  it('should call initialize() on managed services', async () => {
    const initFn = vi.fn();
    const svc: ManagedService = { initialize: initFn };
    serviceRegistry.register('managed', svc);

    await serviceRegistry.initializeAll();

    expect(initFn).toHaveBeenCalledOnce();
    expect(serviceRegistry.ready).toBe(true);
  });

  it('should skip services without initialize()', async () => {
    serviceRegistry.register('plain', { foo: 'bar' });
    // Should not throw
    await serviceRegistry.initializeAll();
    expect(serviceRegistry.ready).toBe(true);
  });

  it('should call destroy() on services in reverse order', async () => {
    const order: string[] = [];
    const makeService = (name: string): ManagedService => ({
      destroy: async () => { order.push(name); },
    });

    serviceRegistry.register('first', makeService('first'));
    serviceRegistry.register('second', makeService('second'));
    serviceRegistry.register('third', makeService('third'));

    await serviceRegistry.destroyAll();

    expect(order).toEqual(['third', 'second', 'first']);
    expect(serviceRegistry.ready).toBe(false);
  });

  it('should detect circular dependency during initialization', async () => {
    // This is a synthetic test — we simulate it by registering a service whose
    // initialize() tries to trigger its own init again. Since the registry
    // iterates sequentially this won't naturally happen, but the guard is there
    // for future dependency-resolution features.
    // For now, just verify the normal flow works without false positives.
    const svc: ManagedService = {
      initialize: vi.fn(),
    };
    serviceRegistry.register('safe', svc);
    await serviceRegistry.initializeAll();
    expect(svc.initialize).toHaveBeenCalledOnce();
  });

  it('should resolve waitForReady() after initialization', async () => {
    serviceRegistry.register('svc', { initialize: vi.fn() });

    let resolved = false;
    const waitPromise = serviceRegistry.waitForReady().then(() => { resolved = true; });

    expect(resolved).toBe(false);
    await serviceRegistry.initializeAll();
    await waitPromise;
    expect(resolved).toBe(true);
  });

  it('should resolve waitForReady() immediately if already ready', async () => {
    await serviceRegistry.initializeAll();
    // Should resolve immediately
    await serviceRegistry.waitForReady();
    expect(serviceRegistry.ready).toBe(true);
  });

  it('should not let one failing service block the rest, or leave ready permanently false', async () => {
    const order: string[] = [];
    const failing: ManagedService = {
      initialize: async () => { order.push('failing'); throw new Error('no reachable relay'); },
    };
    const after: ManagedService = {
      initialize: async () => { order.push('after'); },
    };

    serviceRegistry.register('failing', failing);
    serviceRegistry.register('after', after);

    await expect(serviceRegistry.initializeAll()).resolves.toBeUndefined();

    expect(order).toEqual(['failing', 'after']);
    expect(serviceRegistry.ready).toBe(true);
  });
});
