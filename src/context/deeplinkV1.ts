/**
 * Starcom's deeplink v1 (decision RW8; globe record, section 19).
 *
 * The grammar Mecha Jono's links already use, adopted as Starcom's own, and
 * read exactly as they read it: their 21 vectors are kept beside the record
 * and run against this. A link says which layer, and optionally what beside
 * it, where the camera is, which report to feature, and what time window:
 *
 *   ?v=1&sub=<layer>&pin=<layer,…>&at=<lat,lng[,alt]>&focus=<report id>&win=<from>..<until>
 *
 * v2 (decision IM1; globe record, section 21) adds the globe's look, so a
 * card's link opens the picture lit as it was drawn:
 *
 *   &look=<skin>,<light>,<nightFill>
 *
 * Each part stands or falls alone, an empty part is unstated, and a link says
 * `v=2` only when it states a look: every link that said v1 still reads, and
 * is written, as v1.
 *
 * Each parameter stands or falls alone, and one that is invalid is ignored,
 * never an error: a link with a typo should still show the globe. `v=1` is
 * optional. `sub` and `mode` are read as they always were (modeFromSearch), so
 * the two never disagree. A featured report is an Intel Report, so `focus`
 * makes Intel Reports the layer, with the asked-for layer pinned first beside
 * it; unless that layer is Raver Watch's, Hero Watch's or War & Conflict's,
 * each of which draws and features its own items. RLSH is never pinned from a
 * link.
 *
 * The builder is the parser's inverse, so a card can carry its own address
 * (`provenance.link`) and that address reads back as the view it came from.
 */
import { modeFromSearch } from './visualizationModeFromUrl';
import type { GlobeLightMode, GlobeSkin } from '../services/globe/globeAppearance';

export type DeeplinkLayer =
  | 'IntelReports' | 'CyberThreats' | 'Satellites' | 'CommHubs' | 'RLSH'
  | 'DiplomaticEvents' | 'ResourceZones' | 'ConflictZones' | 'WarConflict' | 'CivilUnrest' | 'ProtestSurges'
  | 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather'
  | 'DrugCheckAlerts' | 'SceneIncidents' | 'SceneEvents' | 'HeatRisk' | 'RaverMissions' | 'HarmReductionSites' | 'Lifeboats' | 'Relief' | 'FieldMissions'
  | 'AiIncidents' | 'AiFrontier' | 'AiWar' | 'AiSafety'
  | 'OpenMissions' | 'CampaignsOperations' | 'SafetyWindows'
  // Psi Watch's (D-PW, PW9); its mode opens only with its switch on (PW19).
  | 'PsiLines' | 'PsiField' | 'PsiZones' | 'PsiRifts' | 'PsiWindows' | 'PsiModel' | 'MagneticShield';

/** What a v1 link is read as. Every field is present; absent or invalid is null, or empty. */
/** The globe's look, as far as a link states it (v2). */
export interface DeeplinkLook {
  skin?: GlobeSkin | 'auto';
  light?: GlobeLightMode;
  nightFill?: number;
}

export interface Deeplink {
  /** The version the link stated, or null. */
  v: 1 | 2 | null;
  sub: DeeplinkLayer | null;
  mode: 'CyberCommand' | 'GeoPolitical' | 'EcoNatural' | 'RaverWatch' | 'HeroWatch' | 'AIWatch' | 'Missions' | 'PsiWatch' | null;
  /** The camera. `alt` is null when the link gave none: the current altitude is kept. */
  at: { lat: number; lng: number; alt: number | null } | null;
  /** Layers drawn beside `sub`. Never `sub` itself, and never RLSH. */
  pins: DeeplinkLayer[];
  /** A report id, as listReports() names it. */
  focus: string | null;
  /** A window, in unix seconds. */
  win: { from: number; until: number } | null;
  /** The globe's look (v2). Absent when the link states none. */
  look?: DeeplinkLook;
}

const LAYERS: readonly DeeplinkLayer[] = [
  'IntelReports', 'CyberThreats', 'Satellites', 'CommHubs', 'RLSH',
  'DiplomaticEvents', 'ResourceZones', 'ConflictZones', 'WarConflict', 'CivilUnrest', 'ProtestSurges',
  'SpaceWeather', 'EcologicalDisasters', 'EarthWeather',
  'DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites',
  'Lifeboats', 'Relief', 'FieldMissions',
  'AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety',
  'OpenMissions', 'CampaignsOperations', 'SafetyWindows',
  'PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows', 'PsiModel', 'MagneticShield',
];
const RAVER_WATCH_LAYERS: ReadonlySet<string> = new Set(['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites']);
/** Layers whose own items a link features: Raver Watch's, Hero Watch's (D-HW, step 7), and War & Conflict's. */
const FEATURES_OWN_ITEMS: ReadonlySet<string> = new Set([...RAVER_WATCH_LAYERS, 'Lifeboats', 'Relief', 'FieldMissions', 'WarConflict', 'CivilUnrest', 'ProtestSurges']);
const MAX_PINS = 4;
/** Globe radii: never inside the surface, never so far the globe is a dot. */
const ALT_FLOOR = 1;
const ALT_CEILING = 10;
/**
 * An addressable report or item (`30023:<pubkey>:<d>`), a mission package such as a Hero Watch field
 * mission (`30079:`), a Raver Watch scene event (`31923:`, a NIP-52 calendar event), or an event id:
 * any of Mecha Jono's addresses, as Interchange 3.7 asks. Nothing else, so no script rides in.
 */
const REPORT_ID = /^(?:(?:30023|30079|31923):[0-9a-f]{64}:[A-Za-z0-9._:~-]{1,200}|[0-9a-f]{64})$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
/** Named here rather than read from the appearance store, which touches storage as it loads. */
const SKINS: readonly string[] = ['auto', 'blueMarble', 'dayNight', 'cyberEarth', 'terrain'];
const LIGHTS: readonly string[] = ['sun', 'headlamp', 'flat'];

/** A layer id in any case, as its canonical id, or null. */
function layerOf(value: string): DeeplinkLayer | null {
  const wanted = value.trim().toLowerCase();
  return LAYERS.find((layer) => layer.toLowerCase() === wanted) ?? null;
}

function cameraFrom(raw: string | null): Deeplink['at'] {
  if (!raw) return null;
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => DECIMAL.test(part))) return null;
  const [lat, lng, alt] = parts.map(Number);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, alt: alt === undefined ? null : Math.min(ALT_CEILING, Math.max(ALT_FLOOR, alt)) };
}

function pinsFrom(raw: string | null, sub: DeeplinkLayer | null): DeeplinkLayer[] {
  if (!raw) return [];
  const pins: DeeplinkLayer[] = [];
  for (const part of raw.split(',')) {
    const layer = layerOf(part);
    if (!layer || layer === 'RLSH' || layer === sub || pins.includes(layer)) continue;
    pins.push(layer);
  }
  return pins.slice(0, MAX_PINS);
}

function windowFrom(raw: string | null): Deeplink['win'] {
  const match = raw?.match(/^(\d+)\.\.(\d+)$/);
  if (!match) return null;
  const [from, until] = [Number(match[1]), Number(match[2])];
  return Number.isSafeInteger(from) && Number.isSafeInteger(until) && from < until ? { from, until } : null;
}

/** What a link's query string says, read as v1. */
export function parseDeeplink(search: string): Deeplink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    params = new URLSearchParams();
  }
  const chosen = modeFromSearch(search);
  let sub: DeeplinkLayer | null = chosen?.subMode ?? null;
  let mode: Deeplink['mode'] = chosen?.mode ?? null;
  let pins = pinsFrom(params.get('pin'), sub);
  const asked = params.get('focus');
  const focus = asked && REPORT_ID.test(asked) ? asked : null;

  // A featured report is an Intel Report: its layer, with the asked-for one first beside it.
  // Raver Watch's, Hero Watch's and War & Conflict's layers feature their own items.
  if (focus && !(sub && FEATURES_OWN_ITEMS.has(sub))) {
    if (sub && sub !== 'IntelReports') pins = [sub, ...pins.filter((pin) => pin !== sub)];
    pins = pins.filter((pin) => pin !== 'IntelReports').slice(0, MAX_PINS);
    sub = 'IntelReports';
    mode = 'CyberCommand';
  }

  const look = lookFrom(params.get('look'));
  const v = params.get('v');
  return {
    v: v === '1' ? 1 : v === '2' ? 2 : null,
    sub,
    mode,
    at: cameraFrom(params.get('at')),
    pins,
    focus,
    win: windowFrom(params.get('win')),
    ...(look ? { look } : {}),
  };
}

/** The parts of a look a link states, each read alone; null when none can be read. */
function lookFrom(raw: string | null): DeeplinkLook | null {
  if (!raw) return null;
  const [skin, light, nightFill] = raw.split(',').map((part) => part.trim());
  const look: DeeplinkLook = {};
  if (skin && SKINS.includes(skin)) look.skin = skin as DeeplinkLook['skin'];
  if (light && LIGHTS.includes(light)) look.light = light as GlobeLightMode;
  if (nightFill && DECIMAL.test(nightFill) && Number(nightFill) >= 0 && Number(nightFill) <= 1) look.nightFill = Number(nightFill);
  return Object.keys(look).length ? look : null;
}

/**
 * The query string that reads back as this link: the smallest one, v1 stated.
 * Unencoded, because every part is drawn from characters a query carries as
 * they are: layer ids, numbers, and a report id's own restricted set.
 */
export function deeplinkSearch(link: Deeplink): string {
  const look = link.look && (link.look.skin !== undefined || link.look.light !== undefined || link.look.nightFill !== undefined)
    ? [link.look.skin ?? '', link.look.light ?? '', link.look.nightFill ?? ''].join(',').replace(/,+$/, '')
    : null;
  const parts = [look ? 'v=2' : 'v=1'];
  if (link.sub) parts.push(`sub=${link.sub}`);
  if (link.at) parts.push(`at=${link.at.lat},${link.at.lng}${link.at.alt === null ? '' : `,${link.at.alt}`}`);
  if (link.pins.length) parts.push(`pin=${link.pins.join(',')}`);
  if (link.focus) parts.push(`focus=${link.focus}`);
  if (link.win) parts.push(`win=${link.win.from}..${link.win.until}`);
  if (look) parts.push(`look=${look}`);
  return `?${parts.join('&')}`;
}
