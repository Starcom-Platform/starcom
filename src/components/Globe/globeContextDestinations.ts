import type { ApplicationId } from '../Router/EnhancedApplicationRouter';

export interface GlobeContextDestination {
  app: ApplicationId;
  context?: Record<string, string>;
}

/**
 * Where the globe's context menu sends a person (decision D-F, step 3.3).
 *
 * Scan Area and Signal Analysis navigated to /netrunner/<target>, an address this app
 * has no route for: the catch-all put the person back on the globe, and the place
 * they had right-clicked was thrown away. Report Incident went to /cases-dashboard, a
 * page in a second layout behind a wallet sign-in, which sent everyone else back to
 * the globe too. Each action now names the application it opens and what it carries.
 *
 * NetRunner reads `initialTarget` (NetRunnerApplication), and four decimals is the
 * precision the menu already used, about ten metres.
 */
export function globeContextDestination(
  actionId: string,
  at: { lat: number; lng: number; precisionM?: number },
): GlobeContextDestination | null {
  const spot = `${at.lat.toFixed(4)},${at.lng.toFixed(4)}`;
  switch (actionId) {
    case 'scan-area':
      return { app: 'netrunner', context: { initialTarget: `area:${spot}` } };
    case 'signal-analysis':
      return { app: 'netrunner', context: { initialTarget: `sigint:${spot}` } };
    case 'report-incident':
      return { app: 'cases' };
    // The report form, at the spot (plan item 0.11). It saved at once with an
    // automatic title, and with a wallet connected did something else again.
    case 'create-intel-report':
      return {
        app: 'inteldashboard',
        context: {
          newReportLat: at.lat.toFixed(4),
          newReportLng: at.lng.toFixed(4),
          ...(at.precisionM !== undefined ? { newReportPrecisionM: String(at.precisionM) } : {}),
        },
      };
    default:
      return null;
  }
}
