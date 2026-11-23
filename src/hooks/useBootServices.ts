/**
 * The services the app runs for the whole session, started once (D-ML relay check, 2026-10-12).
 *
 * This was App's effect on [wasmReady, fetchFromMiniServer], neither of which it reads. WASM becoming ready
 * flipped one, and the provider made the other anew on every render, so about 135 ms into every visit each
 * service here was stopped and started again: the intel intake's pool was closed while its six relay
 * sockets were still connecting ("WebSocket is closed before the connection is established", one per
 * relay, in every visitor's console) and opened a second time. Measured on the live build 661ae088.
 *
 * Run once, on mount, and stopped on unmount. Nothing here waits on WASM; what does should say so itself.
 */
import { REPORT_KIND } from '../services/intel/received/missionReport';
import { keepReceivedReport } from '../services/intel/received/receivedReports';
import { useEffect } from 'react';
import { startFindingsOutboxDrain } from '../services/intel/findings/startOutboxDrain';
import { startEventOutboxDrain } from '../services/intel/outbox/startEventOutboxDrain';
import { startChatNotices } from '../services/chat/chatUnread';
import { startIntelIngestAtBoot } from '../services/intel/startIntelIngestAtBoot';
import { startIntelPersistence } from '../services/intel/intelPersistenceSink';
import { initConsoleErrorMonitoring } from '../utils/consoleErrorFixer';
import { initializeErrorHandling } from '../utils/consoleErrorResolver';
import { initPointerEventsDebugging } from '../utils/pointerEventsDebugger';
import { initLongTaskMonitoring } from '../utils/performanceMonitor';
import { debugLogger, DebugCategory } from '../utils/debugLogger';
import { initializeIntelDataCore, loadIntelSampleData } from '../core/intel';
import { bootstrapServices } from '../services/bootstrap';
import { startLearningNames } from '../services/identity/learnNames';
import { startSealedInboxAtBoot } from '../services/nostr/sealedInbox';
import { keepBundlePart } from '../services/intel/bundles/bundleInbox';
import { secureChatIntegration } from '../services/SecureChatIntegrationService';
import { APP_KINDS } from '../services/nostr/kindRegistry';
import { nostrIdentityService } from '../services/identity/NostrIdentityService';
import { subscribeKeyLock } from '../services/identity/keyLock';
import { manifestSigningKeyStore } from '../services/crypto/ManifestSigningKeyStore';
import { env } from '../config/env';

/** `slim`: Uplink's side panel, which runs none of them (see App's SLIM_PAGE). */
export function useBootServices({ slim }: { slim: boolean }): void {
  useEffect(() => {
    // Initialize console error monitoring in development
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      initConsoleErrorMonitoring();
      initializeErrorHandling();
      initPointerEventsDebugging();
      initLongTaskMonitoring();
    }
    if (slim) return undefined;
    
    // Bootstrap backbone services (Nostr, IPFS, Blockchain, PQC).
    // Backbone bootstrap failures (e.g. no reachable Nostr relays in this
    // environment) shouldn't block the local Intel Data Core — that pipeline
    // works entirely off local storage and doesn't require live relays.
    bootstrapServices().catch((error) => {
      debugLogger.warn(DebugCategory.COMPONENT_LOAD, 'Backbone service bootstrap failed (continuing in degraded mode):', error);
    }).then(() => {
      // Bootstrap the Intelligence Data Core pipeline
      // Initializes storage orchestrator, event infrastructure, and adapters
      return initializeIntelDataCore();
    }).then(() => {
      // Load sample/demo data only in development mode.
      // In production, the workspace starts empty and is populated
      // by live Nostr/IPFS feeds.
      if (env.isDev || env.demoMode) {
        loadIntelSampleData();
      }
    }).catch((error) => {
      debugLogger.error(DebugCategory.COMPONENT_LOAD, 'Intel Data Core bootstrap failed:', error);
    });
    
    // Retry any findings whose broadcast reached no relay — including ones
    // queued in a previous session. App level rather than inside the analyzer,
    // because a durable outbox that only drains when you happen to open one
    // view is not durable.
    const stopOutboxDrain = startFindingsOutboxDrain();
    // And the reports, and their withdrawals, kept when no relay took them (W1).
    const stopEventOutboxDrain = startEventOutboxDrain();

    // Who signs, asked once at start (plan item 2.2). Records are attributed to
    // it, and with an extension installed it is not known until the extension
    // answers. Creates nothing; writing a record asks again if it must.
    void nostrIdentityService.refreshSigner();

    // Names from where people are already named: team rosters and the
    // collaborators on records (plan item 2.1). Kept in this browser only.
    const stopLearningNames = startLearningNames();

    // What teammates seal to this key (plan items 2.4 and 2.7), each routed
    // by what is inside. Listens only with a key already known; makes none.
    const stopSealedInbox = startSealedInboxAtBoot({
      [APP_KINDS.RECORD_BUNDLE_PART]: keepBundlePart,
      [APP_KINDS.CHAT_MESSAGE]: (opened) => secureChatIntegration.receiveSealed(opened),
      // A report on a mission this person published (MX32), kept by the id inside its seal.
      [REPORT_KIND]: keepReceivedReport,
    });

    // Ask the relays now rather than when the globe mounts. Under a software
    // rasterizer that is the difference between intel at 21.7 s and at 2.0 s;
    // on hardware the globe mounts at 0.8 s and it changes nothing measurable.
    // See startIntelIngestAtBoot for why boot owns the lifecycle outright.
    const stopIntelIngest = startIntelIngestAtBoot();

    // Beside the ingest, not inside the globe. The ingest runs for the whole
    // session on every screen; persistence used to run only while the globe's
    // intel layer was mounted, so anything accepted elsewhere was held in
    // memory and written nowhere. See intelPersistenceSink.ts for the measured
    // case (accepted: 3, stored: 0) and for why it matters more now that a
    // report with no place — which the globe can never draw — is accepted.
    const stopIntelPersistence = startIntelPersistence();

    // A notice for each chat message said while you look elsewhere, naming who
    // and where, never what; and the header's unread count (plan item 9.12).
    const stopChatNotices = startChatNotices();

    // Locking the Nostr key, or unlocking it, seals the post-quantum signing key to it too, at once (D-KL, KL7).
    const stopSealingSigningKey = subscribeKeyLock(() => { void manifestSigningKeyStore.sealNow(); });

    return () => {
      stopSealingSigningKey();
      stopChatNotices();
      stopOutboxDrain();
      stopEventOutboxDrain();
      stopIntelIngest();
      stopIntelPersistence();
      stopLearningNames();
      stopSealedInbox();
    };
  // Once: see above. `slim` is fixed for the page's life.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
