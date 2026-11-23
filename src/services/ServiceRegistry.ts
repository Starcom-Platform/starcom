/**
 * Lightweight service registry / DI container.
 *
 * Replaces ad-hoc singleton access (`Service.getInstance()`, `export const x = new X()`)
 * with a single typed lookup point. Core backbone services are registered at boot;
 * remaining services migrate incrementally.
 *
 * Features:
 * - Typed get/register via string keys
 * - Async `initialize()` lifecycle hook on registered services
 * - Circular dependency detection during init
 * - No external deps — plain TypeScript
 */

import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'ServiceRegistry' });

/** Optional interface services can implement for lifecycle management. */
export interface ManagedService {
  /** Called once after all services are registered but before the app renders. */
  initialize?(): Promise<void> | void;
  /** Called during app teardown. */
  destroy?(): Promise<void> | void;
}

interface ServiceEntry {
  instance: unknown;
  initialized: boolean;
}

class ServiceRegistryImpl {
  private services = new Map<string, ServiceEntry>();
  private initializing = new Set<string>();
  private _ready = false;
  private _readyResolve: (() => void) | null = null;
  private _readyPromise: Promise<void>;

  constructor() {
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });
  }

  /** Register a service instance under a unique key. */
  register<T>(key: string, instance: T): void {
    if (this.services.has(key)) {
      log.warn(`Service "${key}" already registered — skipping duplicate`);
      return;
    }
    this.services.set(key, { instance, initialized: false });
    log.debug(`Registered service: ${key}`);
  }

  /** Retrieve a service by key. Throws if not registered. */
  get<T>(key: string): T {
    const entry = this.services.get(key);
    if (!entry) {
      throw new Error(`Service "${key}" is not registered`);
    }
    return entry.instance as T;
  }

  /** Check if a service is registered. */
  has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * Initialize all registered services that implement `initialize()`.
   * Detects circular dependency loops via an "initializing" guard set.
   */
  async initializeAll(): Promise<void> {
    const order = Array.from(this.services.keys());
    log.info(`Initializing ${order.length} services: [${order.join(', ')}]`);

    for (const key of order) {
      await this.initService(key);
    }

    this._ready = true;
    this._readyResolve?.();
    log.info('All services initialized');
  }

  private async initService(key: string): Promise<void> {
    const entry = this.services.get(key);
    if (!entry || entry.initialized) return;

    if (this.initializing.has(key)) {
      throw new Error(`Circular dependency detected while initializing "${key}"`);
    }

    this.initializing.add(key);
    try {
      const svc = entry.instance as ManagedService | null;
      if (svc && typeof svc.initialize === 'function') {
        // One service failing to initialize (e.g. no reachable Nostr relay in this
        // environment) must not abort every service registered after it — that left
        // `_ready` permanently false and skipped otherwise-independent services like
        // IPFS/PQC. Log and move on; the service stays unmarked as initialized so
        // callers checking its own state can still tell it degraded.
        try {
          await svc.initialize();
          entry.initialized = true;
        } catch (error) {
          log.error(`Service "${key}" failed to initialize — continuing in degraded mode:`, error);
        }
      } else {
        entry.initialized = true;
      }
    } finally {
      this.initializing.delete(key);
    }
  }

  /** Destroy all services in reverse registration order. */
  async destroyAll(): Promise<void> {
    const keys = Array.from(this.services.keys()).reverse();
    for (const key of keys) {
      const entry = this.services.get(key);
      if (!entry) continue;
      const svc = entry.instance as ManagedService;
      if (typeof svc.destroy === 'function') {
        try {
          await svc.destroy();
        } catch (err) {
          log.error(`Error destroying service "${key}":`, err);
        }
      }
    }
    this.services.clear();
    this._ready = false;
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });
    log.info('All services destroyed');
  }

  /** True after `initializeAll()` completes. */
  get ready(): boolean {
    return this._ready;
  }

  /**
   * Returns a promise that resolves once all services are initialized.
   * Components can `await serviceRegistry.waitForReady()` as a readiness gate.
   */
  waitForReady(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return this._readyPromise;
  }

  /** List all registered service keys (for diagnostics). */
  keys(): string[] {
    return Array.from(this.services.keys());
  }
}

/** Global service registry singleton. */
export const serviceRegistry = new ServiceRegistryImpl();
