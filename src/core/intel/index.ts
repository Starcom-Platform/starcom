/**
 * IntelDataCore - Main Index
 * 
 * This file exports all the components of the IntelDataCore system
 * for easy importing by other modules.
 */

// Export types
export * from './types/intelDataModels';

// Export data store
export { intelDataStore } from './store/intelDataStore';

// Export event system
export { enhancedEventEmitter } from './events/enhancedEventEmitter';
export type {
  EventSubscriptionOptions,
  EventHandler,
  EventFilterFunction
} from './events/enhancedEventEmitter';

// Export storage system
export { storageOrchestrator } from './storage/storageOrchestrator';
export type {
  StorageStrategy,
  Transaction,
  TransactionStatus
} from './storage/storageOrchestrator';

export {
  indexedDBAdapter
} from './storage/indexedDBAdapter';

// Export adapters
export { nodeWebAdapter, NodeWebAdapter } from './adapters/nodeWebAdapter';
export type {
  NodeWebNode,
  NodeWebEdge,
  NodeWebGraph,
  NodeWebStats,
  NodeWebFilter
} from './adapters/nodeWebAdapter';

export { timelineAdapter, TimelineAdapter } from './adapters/timelineAdapter';
export type {
  TimelineItem,
  TimelineGroup,
  TimelineData,
  TimelineStats,
  TimelineFilter
} from './adapters/timelineAdapter';

export { caseManagerAdapter, CaseManagerAdapter } from './adapters/caseManagerAdapter';
export type {
  CaseItem,
  CaseFilter,
  CaseStats
} from './adapters/caseManagerAdapter';

// Export hooks
export { useNodeWebData } from './hooks/useNodeWebData';
export { useTimelineData } from './hooks/useTimelineData';
export { useCaseManager } from './hooks/useCaseManager';

// Export utilities
export { 
  generateSampleData
} from './utils/sampleDataGenerator';

export {
  generateSampleTimelineData,
  generateAttackScenario
} from './utils/timelineDataGenerator';

export {
  generateSampleCaseData,
  generateRelatedCaseSeries
} from './utils/caseDataGenerator';

// Import local modules to use in initialization
import { storageOrchestrator } from './storage/storageOrchestrator';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'index' });

/**
 * Initialize the IntelDataCore storage and event infrastructure.
 * This bootstraps the intelligence data pipeline — storage orchestrator,
 * event emitter, and adapter connections — without loading sample data.
 * 
 * Call this once at app startup (e.g. in App.tsx useEffect).
 */
export async function initializeIntelDataCore(): Promise<void> {
  log.debug('Initializing IntelDataCore...');
  
  try {
    // Initialize storage orchestrator (IndexedDB + in-memory fallback)
    const storageInitialized = await storageOrchestrator.initialize();
    if (!storageInitialized) {
      log.warn('Storage orchestrator initialization failed, falling back to in-memory only');
    } else {
      log.debug('Storage orchestrator initialized successfully');
    }
    
    log.debug('IntelDataCore initialized — storage and event infrastructure ready');
  } catch (error) {
    log.error('Error initializing IntelDataCore:', error);
    // Don't throw — intel core failure shouldn't crash the app
    log.warn('IntelDataCore running in degraded mode');
  }
}

/**
 * Load sample/demo data into the IntelDataCore, ONCE.
 *
 * ─── WHY THE GUARD ─────────────────────────────────────────────────────────
 *
 * App.tsx calls this on every mount in dev or demo mode, and it used to seed
 * unconditionally. Measured in a browser across three loads: 60 cases, then
 * 120, then 180 — sixty more every time the page was opened, accumulating in
 * IndexedDB forever.
 *
 * The consequences are worse than clutter. A case list that is mostly
 * duplicates cannot be read; any count taken from it is meaningless; and it
 * degrades quietly, so a developer's workspace becomes less usable the longer
 * they work in it. The repeated call was already documented as a fact in
 * sampleDataGenerator's test — what was missing was noticing what it did.
 *
 * "First-run experience" is what the old comment claimed. This makes it true.
 *
 * ─── WHY IT ASKS THE STORE RATHER THAN A FLAG ──────────────────────────────
 *
 * A localStorage marker would desync the moment someone cleared site data for
 * one and not the other, or opened the app in a context where IndexedDB was
 * wiped — and the failure mode is an empty workspace that believes it is
 * seeded, which is the harder direction to debug. Asking whether cases already
 * exist cannot drift from the thing it describes.
 */
/**
 * The seeding already under way, if any.
 *
 * The check above asks the store, but App's startup effect can call this again
 * before the first call has written anything: React.StrictMode runs effects
 * twice in development, and the effect runs again when its dependencies settle.
 * Each call found no cases and seeded, so a fresh load held every sample event
 * three times (93 timeline events from a 31-event seed). Calls that overlap now
 * share one seeding. Once it is done, the next call asks the store again.
 */
let seedingInProgress: Promise<void> | null = null;

export function loadIntelSampleData(): Promise<void> {
  if (!seedingInProgress) {
    seedingInProgress = seedIntelSampleData().finally(() => {
      seedingInProgress = null;
    });
  }
  return seedingInProgress;
}

async function seedIntelSampleData(): Promise<void> {
  try {
    const { caseManagerAdapter } = await import('./adapters/caseManagerAdapter');
    const existing = await caseManagerAdapter.getCases();
    if (existing.length > 0) {
      log.debug(`Sample data already present (${existing.length} cases); not seeding again.`);
      return;
    }
  } catch (error) {
    // If the check itself fails, seed — an empty workspace is a worse first
    // impression than a duplicated one, and this path is dev-only.
    log.warn('Could not determine whether sample data exists; seeding anyway:', error);
  }

  log.debug('Loading IntelDataCore sample data...');

  try {
    const { generateSampleData } = await import('./utils/sampleDataGenerator');
    const { generateSampleTimelineData, generateAttackScenario } = await import('./utils/timelineDataGenerator');
    const { generateSampleCaseData, generateRelatedCaseSeries } = await import('./utils/caseDataGenerator');
    
    await generateSampleData();
    await generateSampleTimelineData(20);
    await generateAttackScenario();
    await generateSampleCaseData(15);
    await generateRelatedCaseSeries();
    
    log.debug('IntelDataCore sample data loaded successfully');
  } catch (error) {
    log.error('Error loading IntelDataCore sample data:', error);
  }
}
