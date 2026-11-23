import { fetchNaturalEvents, type NaturalEvent } from '../../GeoEventsService';

import { observationIngestService, type ObservationIngestService } from './ObservationIngestService';
import { usgsAdapter, gdacsAdapter, eonetAdapter } from './adapters/naturalEventAdapter';
import { ucdpAdapter, type UcdpGedRecord } from './adapters/ucdpAdapter';
import { createGleifAdapter, type GleifRecord } from './adapters/gleifAdapter';
import { wikidataAdapter, type WikidataHqStatement } from './adapters/wikidataAdapter';
import { buildPlaceResolver, NO_PLACE_RESOLVER, type GazetteerPlace, type PlaceResolver } from './placeGazetteer';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { createNavcomAdapter, type NavcomRawEvent } from './adapters/navcomAdapter';
import { NavcomVocabularySource, NAVCOM_WELL_KNOWN_PATH } from './adapters/navcomVocabulary';
import { fetchNavcomEvents, fetchNavcomEventsById } from './navcomFeed';
import type { Observation } from '../../../types/intel/SourceObservation';
import { readIntelStanding, type IntelStanding } from './operatorStanding';
import { createRelayPool } from '../../nostr/relayPool';
import { readRelays } from '../../nostr/publishTargets';
import { NAVCOM_ORIGIN } from '../../../config/publicInfrastructure';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'RegisterSources' });

/**
 * Wires adapters to real fetchers.
 *
 * Only sources with a working fetch path are registered. An adapter without a
 * pipe is left unregistered rather than registered against a stub, because a
 * registered source that never returns anything reports as `empty` — "we
 * checked and there was nothing" — which is a false statement about the world.
 * Absent is the honest representation of a source we cannot reach at all.
 *
 * Registered today:
 *   USGS, GDACS, NASA EONET  — via fetchNaturalEvents, which already
 *                              normalises all three into NaturalEvent and is
 *                              the same data the globe has been rendering.
 *   UCDP                     — from a static CC BY 4.0 dataset asset, no
 *                              credential required. See fetchUcdpRecords.
 *   GLEIF                    — from a static CC0 asset, seeded from the
 *                              Wikidata intersection. See fetchGleifRecords.
 *   Wikidata                 — headquarters statements on LEI-carrying
 *                              companies, CC0. An AGGREGATOR: every statement
 *                              is attributed to the source it cites, so the
 *                              ones imported from GLEIF share GLEIF's feed and
 *                              cannot corroborate it.
 *
 * NOT registered:
 *   ReliefWeb   — has no fetch path. Its only one lived in FeedsService, which
 *                 was deleted for carrying hardcoded API keys. The adapter is
 *                 complete and tested against the documented v1 shape; the pipe
 *                 does not exist.
 *   NetRunner   — its Intel records are produced by bot missions on demand
 *                 rather than polled, so it is fed by BotMissionExecutor
 *                 rather than by this poller. Registering a poll for it would
 *                 misrepresent how that source works.
 */

/**
 * UCDP from a static, redistributable asset rather than the credentialed API.
 *
 * The REST API now returns 401 without a per-user access token. A credential
 * held by one person is precisely the single-operator dependency the OSEE
 * pillar's own test rejects — "could a different, unaffiliated group stand up
 * their own instance." With a token, the honest answer was no.
 *
 * UCDP's Download Center publishes the same data as CSV under CC BY 4.0 with
 * no credential at all. scripts/fetch-ucdp-dataset.mjs projects it to the
 * fields this adapter reads and writes public/data/ucdp-ged.json; the app
 * loads that same-origin. Better on every axis this project cares about:
 * anyone can fork and run it, it can be pinned to IPFS, it works offline, and
 * the required citations travel inside the file rather than living in a README
 * nobody reads.
 *
 * The upstream also sends no Access-Control-Allow-Origin, so a browser could
 * not have fetched the CSV directly regardless.
 */
const UCDP_DATASET_URL = '/data/ucdp-ged.json';

interface UcdpDatasetPayload {
  events?: UcdpGedRecord[];
  datasetVersion?: string;
  citation?: string[];
}

/**
 * GLEIF from a static CC0 asset, bounded to the Wikidata intersection.
 *
 * Same packaging reasoning as UCDP above: a fork gets exactly this data with no
 * account, it can be pinned to IPFS, it works offline, and the licence and
 * citation travel inside the file rather than in a README nobody reads.
 *
 * THE SELECTION RATIONALE HERE IS OBSOLETE, AND MEASURED TO BE SO. It used to
 * read: "only the ~48,000 that another open registry also describes can ever be
 * corroborated", which was sound when Wikidata was the only other registry.
 * Both halves are now wrong.
 *
 * There are complete national registers, so the intersection is no longer the
 * limit. And agreement with them would be echo rather than corroboration: an
 * LEI issuer validates each entity against its home register, measured at
 * docs/measurements/gleif-register-agreement.md.
 *
 * More to the point, these observations produce nothing. Measured over the
 * committed assets: 187 corroborated findings with GLEIF, 187 without, 0
 * strengthened, 0 weakened. GLEIF asserts `registeredCity` and
 * `registeredCountry`; Wikidata asserts `headquartersCity` and
 * `headquartersCountry`. Those never join, and correctly — a registered office
 * is not a headquarters — so no source this project holds asserts the same
 * attribute GLEIF does, and the one class that would (national registers) is
 * echo.
 *
 * GLEIF's value is realised elsewhere: as enumerations over complete
 * populations, in the LEI coverage and foreign-parentage claims. Whether this
 * observation path should be retired is plan item 37, and is a decision about
 * the system's shape rather than a defect to fix quietly.
 */
const GLEIF_DATASET_URL = '/data/gleif.json';

interface GleifDatasetPayload { records?: GleifRecord[] }

async function fetchGleifRecords(): Promise<GleifRecord[]> {
  const res = await fetch(GLEIF_DATASET_URL);
  if (!res.ok) throw new Error(`GLEIF dataset asset returned HTTP ${res.status}`);

  const payload = await res.json() as GleifDatasetPayload;
  if (!Array.isArray(payload?.records)) {
    // An unrecognised shape is a failure, not an empty result — the same rule
    // as UCDP. Returning [] would record the source as `empty`, asserting the
    // registry holds nothing.
    throw new Error('GLEIF dataset asset did not contain a records array');
  }
  return payload.records;
}

const WIKIDATA_DATASET_URL = '/data/wikidata-hq.json';

interface WikidataDatasetPayload {
  statements?: WikidataHqStatement[];
  places?: GazetteerPlace[];
  /** Each company's name by LEI, fetched beside the statements for reading only (plan item 3.6). */
  companyNames?: Record<string, string>;
}

/**
 * The place gazetteer, loaded once from the Wikidata asset.
 *
 * GLEIF needs it to resolve `Köln` to the same id Wikidata calls `Cologne`,
 * and the gazetteer ships inside the Wikidata asset because Wikidata is where
 * the place identities and their names come from. Memoised: both adapters
 * ingest in the same pass and re-fetching would double the request for no gain.
 */
let placeResolver: PlaceResolver | null = null;

async function loadPlaceResolver(): Promise<PlaceResolver> {
  if (placeResolver) return placeResolver;
  try {
    const res = await fetch(WIKIDATA_DATASET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json() as WikidataDatasetPayload;
    placeResolver = buildPlaceResolver(payload.places ?? []);
  } catch {
    // No gazetteer means GLEIF resolves no cities and COUNTS them as dropped,
    // rather than falling back to raw name comparison — which is the failure
    // D14 records. Country claims are unaffected.
    placeResolver = NO_PLACE_RESOLVER;
  }
  return placeResolver;
}

async function fetchWikidataStatements(): Promise<WikidataHqStatement[]> {
  const res = await fetch(WIKIDATA_DATASET_URL);
  if (!res.ok) throw new Error(`Wikidata dataset asset returned HTTP ${res.status}`);

  const payload = await res.json() as WikidataDatasetPayload;
  if (!Array.isArray(payload?.statements)) {
    throw new Error('Wikidata dataset asset did not contain a statements array');
  }
  const names = payload.companyNames ?? {};
  return payload.statements.map((st) => (st?.lei && typeof names[st.lei] === 'string' ? { ...st, company: names[st.lei] } : st));
}

async function fetchUcdpRecords(): Promise<UcdpGedRecord[]> {
  const res = await fetch(UCDP_DATASET_URL);
  if (!res.ok) throw new Error(`UCDP dataset asset returned HTTP ${res.status}`);

  const payload = await res.json() as UcdpDatasetPayload;
  if (!Array.isArray(payload?.events)) {
    // An unrecognised shape is a failure, not an empty result. Returning []
    // would record the source as `empty` and assert there were no conflict
    // events at all.
    throw new Error('UCDP dataset asset did not contain an events array');
  }
  return payload.events;
}

/*
 * NavCom's raw intel (decision D-MX, MX3): kind 1911 from every relay this node
 * reads, checked against NavCom's contract, whose vocabulary is fetched from
 * NavCom and never pinned. Refreshed before each read, since the check itself
 * is synchronous.
 */
const navcomVocabulary = new NavcomVocabularySource(async () => {
  const res = await fetch(`${NAVCOM_ORIGIN}${NAVCOM_WELL_KNOWN_PATH}`);
  if (!res.ok) throw new Error(`NavCom's contract returned HTTP ${res.status}`);
  return res.json();
});

/** Rebuilt from its fields before verifying: a cached result survives a spread copy (see missionCapability.ts). */
function verifyNavcomEvent(e: NavcomRawEvent): boolean {
  try {
    return verifyEvent({
      id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
    } as NostrEvent);
  } catch {
    return false;
  }
}

const navcomAdapter = createNavcomAdapter({ verifySignature: verifyNavcomEvent, vocabulary: () => navcomVocabulary.current });

async function fetchNavcomObservations(): Promise<NavcomRawEvent[]> {
  await navcomVocabulary.get();
  const relays = [...readRelays('MISSION')];
  const pool = createRelayPool();
  try {
    return await fetchNavcomEvents({ relays, pool });
  } finally {
    pool.close(relays);
  }
}

/**
 * The observations a report or package cites, looked up by id on the relays
 * this node already reads, and on no other (decision D-MX, MX23). A relay a
 * citation names is its author's choice, and asking it would tell that relay
 * who is reading, and when. Each is checked as every NavCom observation is, by
 * its signature and against the vocabulary NavCom publishes. Rejects when no
 * relay answers at all.
 */
export async function readCitedObservations(ids: readonly string[]): Promise<Observation[]> {
  await navcomVocabulary.get();
  const relays = [...readRelays('MISSION')];
  const pool = createRelayPool();
  try {
    return navcomAdapter.toObservations(await fetchNavcomEventsById({ ids, relays, pool })).observations;
  } finally {
    pool.close(relays);
  }
}

/**
 * An operator's Intel standing as NavCom derives it (decision D-MX: MX8, MX25,
 * MX26), from the relays this node reads: their observations, each checked as
 * every one is, and the reports and packages other keys signed that cite them.
 */
export async function readOperatorStanding(operator: string): Promise<IntelStanding> {
  await navcomVocabulary.get();
  const relays = [...readRelays('MISSION')];
  const pool = createRelayPool();
  try {
    return await readIntelStanding(operator, {
      relays,
      pool,
      observationIds: (events) => [...new Set(
        navcomAdapter.toObservations(events as NavcomRawEvent[]).observations
          .map((o) => o.sourceRecordId)
          .filter((id): id is string => typeof id === 'string'),
      )],
      verify: (event) => verifyNavcomEvent(event as NavcomRawEvent),
    });
  } finally {
    pool.close(relays);
  }
}

let registered = false;

export function registerObservationSources(service: ObservationIngestService = observationIngestService): void {
  if (registered && service === observationIngestService) return;

  // One fetch, shared by the three adapters that read NaturalEvent — each
  // filters to its own source. Fetching three times would triple the load on
  // upstream for identical data.
  let inflight: Promise<NaturalEvent[]> | null = null;
  const naturalEvents = () => {
    if (!inflight) {
      inflight = fetchNaturalEvents().finally(() => { inflight = null; });
    }
    return inflight;
  };

  service.register({ adapter: usgsAdapter, fetch: naturalEvents });
  service.register({ adapter: gdacsAdapter, fetch: naturalEvents });
  service.register({ adapter: eonetAdapter, fetch: naturalEvents });
  // No credential gate: the static dataset is available to every deployment,
  // which is the whole reason for preferring it over the API.
  service.register({ adapter: ucdpAdapter, fetch: fetchUcdpRecords });
  // Constructed with the gazetteer rather than imported as a singleton: an
  // adapter built before the place data exists resolves nothing forever.
  service.register({ adapter: createGleifAdapter((n, c) => (placeResolver ?? NO_PLACE_RESOLVER)(n, c)), fetch: async () => {
    await loadPlaceResolver();
    return fetchGleifRecords();
  } });
  service.register({ adapter: wikidataAdapter, fetch: fetchWikidataStatements });
  service.register({ adapter: navcomAdapter, fetch: fetchNavcomObservations });

  if (service === observationIngestService) registered = true;
  log.info(`Registered ${service.registeredSourceIds().length} observation sources: ${service.registeredSourceIds().join(', ')}`);
}
