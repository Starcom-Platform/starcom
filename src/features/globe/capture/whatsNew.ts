/**
 * What is new since a moment, for Mecha Jono's desks (plan H10; the owner's pick of 25 Oct, "both sides"): the items
 * the feeds Starcom reads gained after `since`, by layer, each with its title, time, source and link. Each source says
 * whether it was read and how far back it reaches, so a count is never taken as complete when it is not.
 *
 * - Space Weather: the alerts, warnings and watches SWPC issued (products/alerts.json, which holds recent days only),
 *   and the coronal mass ejections DONKI lists, each by when it was first seen.
 * - Resources: EIA's production series. They are yearly figures, each new when its standing figures were written:
 *   the note on The Record, or EIA's own update of the file. The rest of the layer, resource types and trade routes,
 *   is baked into Starcom and never arrives (the owner's pick of 26 Oct: say so, and count the notes when they come).
 */
import { fetchNoaaSpaceWeatherSummary, NOAA_ALERTS_URL, type NoaaOfficialAlert } from '../../../services/space-weather/noaaSummary';
import { donkiCmesBetweenUrl, parseCmesSeen, type CmeSeen } from '../../../services/spaceWeather/donki';
import { ENERGY_SERIES, loadEnergyProduction, type EnergyProduction } from '../../../services/geopolitical/energyProduction';
import { formatUtcDateTime } from '../../../utils/utcTime';

/** How far back a moment may be: DONKI is asked for the days between, and SWPC's list holds far less. */
export const WHATS_NEW_MAX_DAYS = 31;
const DAY_MS = 86_400_000;

const SWPC_PAGE = 'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings';
const EIA_PAGE = 'https://www.eia.gov/international/data/world';

export type WhatsNewLayerName = 'SpaceWeather' | 'ResourceZones';

export interface WhatsNewItem {
  id: string;
  title: string;
  /** `alert`, `warning`, `watch`, `summary` or `message` from SWPC; `cme`; `figures`, a yearly series. */
  kind: string;
  /** `event`, when it happened; `written`, when its source issued or wrote it. */
  time: { iso: string; basis: 'event' | 'written' };
  source: string;
  link: string;
}

export interface WhatsNewSource {
  name: string;
  url: string;
  /** `ok`, or why it was not read. */
  read: string;
  /** ISO: the oldest item a source that holds only recent ones gave, when it gave any. */
  reachesBack?: string;
}

export interface WhatsNewLayer {
  layer: WhatsNewLayerName;
  count: number;
  /** Newest first. */
  items: WhatsNewItem[];
  sources: WhatsNewSource[];
  /** Every source was read and reaches back to the moment. */
  complete: boolean;
  note: string;
}

export interface WhatsNew {
  since: string;
  until: string;
  layers: WhatsNewLayer[];
}

export interface WhatsNewFeeds {
  alerts: () => Promise<NoaaOfficialAlert[]>;
  cmes: (from: number, until: number) => Promise<CmeSeen[]>;
  energy: () => Promise<EnergyProduction>;
}

/** The feeds the app reads, each with its own cache. */
export const WHATS_NEW_FEEDS: WhatsNewFeeds = {
  alerts: async () => (await fetchNoaaSpaceWeatherSummary()).alerts,
  cmes: async (from, until) => {
    const response = await fetch(donkiCmesBetweenUrl(from, until));
    if (!response.ok) throw new Error(`DONKI answered ${response.status}`);
    return parseCmesSeen(await response.json());
  },
  energy: loadEnergyProduction,
};

/** The moment and its end, ms, from whole unix seconds; throws why when they cannot be read. */
export function whatsNewWindow(since: unknown, until: unknown, now: number): { from: number; until: number } {
  const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  if (!whole(since) || (until !== undefined && !whole(until))) {
    throw new Error('whatsNew takes since, and until if given, in whole unix seconds.');
  }
  const from = since * 1000;
  const end = whole(until) ? until * 1000 : now;
  if (from >= end) throw new Error('whatsNew takes a since before its until.');
  if (end - from > WHATS_NEW_MAX_DAYS * DAY_MS) throw new Error(`whatsNew reaches back ${WHATS_NEW_MAX_DAYS} days at most.`);
  return { from, until: end };
}

const within = (ms: number, w: { from: number; until: number }) => ms > w.from && ms <= w.until;
const reason = (error: unknown) => `not read: ${error instanceof Error ? error.message : String(error)}`;
const newestFirst = (a: WhatsNewItem, b: WhatsNewItem) => b.time.iso.localeCompare(a.time.iso);

/** SWPC's word for its message, from the message's own first line, past what it puts first ("CONTINUED ALERT"). */
function kindOf(headline: string): string {
  const word = /^(?:(?:CONTINUED|EXTENDED|CANCEL) )?(ALERT|WARNING|WATCH|SUMMARY)\b/.exec(headline)?.[1];
  return word ? word.toLowerCase() : 'message';
}

function cmeTitle(seen: CmeSeen): string {
  if (!seen.cme) return 'Coronal mass ejection, not measured yet';
  const head = `Coronal mass ejection, ${Math.round(seen.cme.speed)} km/s`;
  const { earth } = seen.cme;
  if (earth.kind === 'arrives') return `${head}, modelled to reach the Earth ${formatUtcDateTime(earth.at)}${earth.glancing ? ', a glancing blow' : ''}`;
  if (earth.kind === 'misses') return `${head}, modelled to miss the Earth`;
  return `${head}, not modelled to the Earth yet`;
}

async function spaceWeather(w: { from: number; until: number }, feeds: WhatsNewFeeds): Promise<WhatsNewLayer> {
  const [alerts, cmes] = await Promise.allSettled([feeds.alerts(), feeds.cmes(w.from, w.until)]);
  const items: WhatsNewItem[] = [];
  const alertSource: WhatsNewSource = { name: "NOAA SWPC's alerts, warnings and watches", url: NOAA_ALERTS_URL, read: 'ok' };
  let reaches = false;
  if (alerts.status === 'fulfilled') {
    const oldest = alerts.value.reduce<string | null>((o, a) => (o === null || a.issuedAt < o ? a.issuedAt : o), null);
    if (oldest) alertSource.reachesBack = oldest;
    reaches = oldest !== null && Date.parse(oldest) <= w.from;
    for (const a of alerts.value) {
      if (!within(Date.parse(a.issuedAt), w)) continue;
      items.push({ id: `swpc:${a.productId}:${a.issuedAt}`, title: a.headline, kind: kindOf(a.headline), time: { iso: a.issuedAt, basis: 'written' }, source: 'NOAA SWPC', link: SWPC_PAGE });
    }
  } else alertSource.read = reason(alerts.reason);
  const cmeSource: WhatsNewSource = { name: "NASA DONKI's coronal mass ejections, as CCMC catalogues them", url: donkiCmesBetweenUrl(w.from, w.until), read: 'ok' };
  if (cmes.status === 'fulfilled') {
    for (const seen of cmes.value) {
      if (!within(seen.startTime, w)) continue;
      items.push({ id: seen.id, title: cmeTitle(seen), kind: 'cme', time: { iso: new Date(seen.startTime).toISOString(), basis: 'event' }, source: 'NASA DONKI', link: seen.link || 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/' });
    }
  } else cmeSource.read = reason(cmes.reason);
  items.sort(newestFirst);
  return {
    layer: 'SpaceWeather', count: items.length, items, sources: [alertSource, cmeSource],
    complete: alertSource.read === 'ok' && reaches && cmeSource.read === 'ok',
    note: 'SWPC holds its recent messages only. A CME counts from when it was first seen; DONKI measures it later.',
  };
}

async function resources(w: { from: number; until: number }, feeds: WhatsNewFeeds): Promise<WhatsNewLayer> {
  const source: WhatsNewSource = { name: "EIA's production of crude oil, dry natural gas and renewables", url: EIA_PAGE, read: 'ok' };
  const items: WhatsNewItem[] = [];
  try {
    const production = await feeds.energy();
    if (!Object.keys(production).length) throw new Error('neither The Record nor the file answered');
    for (const key of ENERGY_SERIES) {
      const series = production[key];
      if (!series?.written || !within(Date.parse(series.written), w)) continue;
      items.push({
        id: `eia:${key}:${series.year}`, title: `${series.name}, ${series.year} figures (${series.unit})`, kind: 'figures',
        time: { iso: series.written, basis: 'written' },
        source: series.via === 'record' ? 'EIA, as posted on The Record' : 'EIA, from its own update',
        link: EIA_PAGE,
      });
    }
  } catch (error) {
    source.read = reason(error);
  }
  items.sort(newestFirst);
  return {
    layer: 'ResourceZones', count: items.length, items, sources: [source], complete: source.read === 'ok',
    note: "Resources are yearly figures: EIA's series count when they were written. Resource types and trade routes never arrive.",
  };
}

/** What each layer's feeds gained in the window, read now. */
export async function whatsNewSince(w: { from: number; until: number }, feeds: WhatsNewFeeds = WHATS_NEW_FEEDS): Promise<WhatsNew> {
  const layers = await Promise.all([spaceWeather(w, feeds), resources(w, feeds)]);
  return { since: new Date(w.from).toISOString(), until: new Date(w.until).toISOString(), layers };
}
