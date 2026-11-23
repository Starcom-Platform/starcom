import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservationIngestService } from '../ObservationIngestService';

const envMock: { corsProxyUrl: string } = { corsProxyUrl: '' };
vi.mock('../../../../config/env', () => ({ env: envMock }));
vi.mock('../../../GeoEventsService', () => ({ fetchNaturalEvents: vi.fn(async () => []) }));
// NavCom's observations are read from relays (registerSources.navcom.test.ts); none are reached from here.
vi.mock('../../../nostr/relayPool', () => ({ createRelayPool: () => ({ querySync: async () => [], close: () => {} }) }));

const { registerObservationSources } = await import('../registerSources');

describe('source registration — absent beats falsely reachable', () => {
  beforeEach(() => { envMock.corsProxyUrl = ''; });

  it('registers the three feeds that have a working fetch path', () => {
    const svc = new ObservationIngestService();
    registerObservationSources(svc);

    expect(svc.registeredSourceIds()).toEqual(
      expect.arrayContaining(['usgs-earthquakes', 'gdacs', 'nasa-eonet'])
    );
  });

  it('registers UCDP with no credential at all', () => {
    const svc = new ObservationIngestService();
    registerObservationSources(svc);

    // The REST API needs a per-user token; the CC BY 4.0 dataset asset needs
    // nothing. A source only one person can reach fails the OSEE test that
    // an unaffiliated group could stand up their own instance.
    expect(svc.registeredSourceIds()).toContain('ucdp-ged');
  });

  it('never registers ReliefWeb, which has no fetch path at all', () => {
    const svc = new ObservationIngestService();
    registerObservationSources(svc);
    expect(svc.registeredSourceIds()).not.toContain('reliefweb');
  });

  it('never registers NetRunner, which is fed on demand rather than polled', () => {
    const svc = new ObservationIngestService();
    registerObservationSources(svc);
    expect(svc.registeredSourceIds()).not.toContain('netrunner-osint');
  });

  it("names each company Wikidata describes from the snapshot's names list (plan item 3.6)", async () => {
    const LEI = '391200XXYCPAKDL8MN50';
    const OTHER = '529900RZW197X0YYRJ82';
    const THIRD = '2138009TF1SYOMQLBJ60';
    const statement = (lei: string) => ({ lei, hqQid: 'Q1726', hq: 'Munich', country: 'DE', sourceQid: 'Q3509449', sourceLabel: 'SIRENE', modified: '2026-02-01T00:00:00Z' });
    const payload = {
      statements: [statement(LEI), statement(OTHER), statement(THIRD)],
      places: [],
      companyNames: { [LEI]: 'Lohner Capital GmbH', [THIRD]: 'Go-Ahead Group plc' },
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/data/wikidata-hq.json'
      ? { ok: true, status: 200, json: async () => payload }
      : { ok: false, status: 404, json: async () => ({}) }));
    try {
      const svc = new ObservationIngestService();
      registerObservationSources(svc);
      const { observations } = await svc.ingestAll();
      const of = (lei: string) => observations.filter((o) => o.sourceId === 'wikidata' && o.subjectEntityRef === lei);
      expect(of(LEI).length).toBeGreaterThan(0);
      for (const o of of(LEI)) expect(o.subjectName).toBe('Lohner Capital GmbH');
      expect(of(OTHER).length).toBeGreaterThan(0);
      for (const o of of(OTHER)) expect(o.subjectName).toBeUndefined();
      // Each company by its own LEI.
      expect(of(THIRD).length).toBeGreaterThan(0);
      for (const o of of(THIRD)) expect(o.subjectName).toBe('Go-Ahead Group plc');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
