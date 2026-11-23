/**
 * Application bootstrap — registers core backbone services into the ServiceRegistry
 * and runs their async initialization in dependency order.
 *
 * Call `bootstrapServices()` once at app startup (before rendering).
 */

import { serviceRegistry } from './ServiceRegistry';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'Bootstrap' });

// In-flight promise guard: React 18 StrictMode double-invokes effects in
// development, so App.tsx's mount effect can call bootstrapServices() twice
// in quick succession, before `serviceRegistry.ready` is set by the first
// call's initializeAll(). Without this guard, the second call raced ahead
// and called initializeAll() concurrently, tripping ServiceRegistry's
// same-key reentrancy guard (misreported as a circular dependency, since two
// concurrent top-level bootstraps looks identical to one service depending
// on itself mid-init).
let bootstrapPromise: Promise<void> | null = null;

/**
 * Register and initialize all backbone services.
 * Safe to call multiple times — concurrent/repeat calls share the same
 * in-flight (or already-completed) initialization.
 */
export function bootstrapServices(): Promise<void> {
  if (serviceRegistry.ready) {
    log.debug('Services already bootstrapped — skipping');
    return Promise.resolve();
  }

  if (bootstrapPromise) {
    log.debug('Bootstrap already in progress — awaiting existing promise');
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    // ── Phase 1: Register core services (order matters for dependencies) ──
    // Lazy-import to avoid top-level side-effects until we're ready

    const { default: nostrService } = await import('./nostrService');
    serviceRegistry.register('nostr', nostrService);

    const { default: ipfsService } = await import('./IPFSService');
    serviceRegistry.register('ipfs', ipfsService);

    // BlockchainService.ts is currently empty — register a placeholder
    // so dependents can check `serviceRegistry.has('blockchain')` safely.
    serviceRegistry.register('blockchain', null);

    const { pqCryptoService } = await import('./crypto/PQCryptoService');
    serviceRegistry.register('pqc', pqCryptoService);

    // ── Phase 2: Initialize services that need async setup ──
    await serviceRegistry.initializeAll();

    log.info(`Bootstrap complete — ${serviceRegistry.keys().length} services registered`);
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
