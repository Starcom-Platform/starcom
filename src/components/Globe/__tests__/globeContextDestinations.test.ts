/**
 * Where the globe's context menu sends a person (decision D-F, step 3.3).
 *
 * Scan Area and Signal Analysis navigated to /netrunner/<target>, an address this
 * app has no route for, so the catch-all put the person back on the globe with
 * nothing said and the target thrown away. Report Incident went to
 * /cases-dashboard, a page in a second layout behind a wallet sign-in. Each opens
 * its application now, carrying what the menu knew.
 */
import { describe, it, expect } from 'vitest';
import { globeContextDestination } from '../globeContextDestinations';

const AT = { lat: 38.9072, lng: -77.0369 };

describe('globeContextDestination', () => {
  it('opens NetRunner on the area that was right-clicked', () => {
    expect(globeContextDestination('scan-area', AT)).toEqual({
      app: 'netrunner',
      context: { initialTarget: 'area:38.9072,-77.0369' },
    });
  });

  it('opens NetRunner on the signals at that spot', () => {
    expect(globeContextDestination('signal-analysis', AT)).toEqual({
      app: 'netrunner',
      context: { initialTarget: 'sigint:38.9072,-77.0369' },
    });
  });

  // Plan item 0.11: it saved at once with an automatic title, and with a wallet
  // connected went somewhere else entirely. It opens the report form now.
  it('opens the report form at the spot, with how precisely the click gave it', () => {
    expect(globeContextDestination('create-intel-report', { ...AT, precisionM: 1000 })).toEqual({
      app: 'inteldashboard',
      context: { newReportLat: '38.9072', newReportLng: '-77.0369', newReportPrecisionM: '1000' },
    });
  });

  it('opens Cases to report an incident', () => {
    expect(globeContextDestination('report-incident', AT)).toEqual({ app: 'cases' });
  });

  it('says nothing about an action that goes nowhere', () => {
    expect(globeContextDestination('measure-distance', AT)).toBeNull();
  });
});
