import { nostrStarcomIntelIngest } from './NostrStarcomIntelIngest';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'IntelIngestBoot' });

/**
 * Ask the relays while the app boots, rather than when the globe mounts
 * (decision D-F, step 4.2).
 *
 * ─── WHO IT IS FOR ─────────────────────────────────────────────────────────
 *
 * Measured on one production build, same page, same relays: under a software
 * rasterizer a first visit paints the globe at 10.9 s and shows intel at 21.7 s;
 * with hardware rendering it paints at 0.8 s and shows intel at 2.0 s. The ingest
 * did not start until the globe's effect ran, so the software column spent about
 * eleven seconds before the relays were asked at all.
 *
 * On hardware this changes nothing measurable. It is for the visitors who wait,
 * and `webglSupport.ts` describes that population as "considerably larger than
 * the one with no WebGL at all".
 *
 * ─── WHY BOOT OWNS THE LIFECYCLE AND NOT ONLY THE START ────────────────────
 *
 * Moving the start alone would have been a regression. The globe starts the
 * ingest inside an effect whose cleanup calls `stop()`, and that effect re-runs
 * on sub-mode change, layer change, timeline scrub and any refresh-setting
 * change. Since the globe holds the only other `start()`, a boot-started ingest
 * was killed by the first layer switch and never restarted: intel sooner once,
 * then never again.
 *
 * So the globe stops calling `stop()`. Relay connections now live for the whole
 * session, on every screen, for every visitor — including people who never open
 * the intel layer. That overturns what the globe's start site used to say,
 * "intentionally scoped to IntelReports mode to avoid persistent background
 * relay traffic", knowingly and in full. If relay load on the peer node becomes
 * the binding constraint, this is the decision to revisit first.
 *
 * ─── WHY NOT INSIDE bootstrapServices() ────────────────────────────────────
 *
 * That function is memoised and rethrows, and its `initializeAll()` would put a
 * relay connection on the path that gates the local Intel Data Core — which
 * App.tsx deliberately keeps independent of relay reachability, so a machine
 * with no reachable relay still gets its local pipeline. This runs beside it
 * instead, in the same shape as `startFindingsOutboxDrain`, whose rule it
 * inherits: never let a failure escape into app startup.
 */
export function startIntelIngestAtBoot(): () => void {
  let disposed = false;

  // start() returns early without a window, but a boot path that assumed one
  // would still be wrong under any non-DOM runtime.
  if (typeof window === 'undefined') return () => {};

  void (async () => {
    try {
      await nostrStarcomIntelIngest.start();
      // Disposed while the pool was opening: the start settles after the app has
      // torn down, and without this it leaves relay sockets behind it.
      if (disposed && nostrStarcomIntelIngest.isActive()) {
        nostrStarcomIntelIngest.stop();
      }
    } catch (error) {
      log.warn('Ingest did not start at boot:', error instanceof Error ? error.message : String(error));
    }
  })();

  return () => {
    disposed = true;
    if (nostrStarcomIntelIngest.isActive()) nostrStarcomIntelIngest.stop();
  };
}
