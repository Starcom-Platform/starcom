/**
 * A received package as a card that leads with what it asks (decision D-MF, MF1): the objective as the headline,
 * why it matters, the place, the end, the effort and the steps. It states only what the package states.
 *
 * Read from the packages Mecha Jono published to The Record (2026-10-16): the description opens with
 * "MISSION: …" and a paragraph of stakes follows; the place and the end are in profile.fieldWork, or in
 * metadata.mechaJono's area and window. A title is often a device model or a town ("Anjvision YSSD-RTMP-H5",
 * "Jackson, TN"), so it is kept as what the mission is about, under the mission line.
 */
import type { AcceptedPackage } from '../MissionPackageIngest';
import type { PackageProfile } from '../../exchange/types';
import { statedProfile } from '../packageProfile';

export interface MissionPlace {
  /** A US state or territory, by its two-letter code. */
  state?: string;
  /** A country, by its ISO 3166 two-letter code, when no state is named. */
  country?: string;
  /** Areas the package names within it, as it names them (a forecast's zones). */
  areas?: string[];
}

/** A psi mission's window (Psi Watch's missions, decision D-PW, PW92), in ms. */
export interface PsiMissionWindow {
  fromMs: number;
  peakMs: number;
  untilMs: number;
}

export interface MissionCard {
  /** Its address (signer and `d`), or its event id when it has none. */
  key: string;
  headline: string;
  /** The package's own title, when the headline is its mission line instead. */
  subject?: string;
  /** Why it matters: the stakes it states, two sentences at most. */
  stakes?: string;
  place?: MissionPlace;
  /** When it ends, in ms. */
  closesAt?: number;
  /** A psi mission's window, in ms (decision D-PW, PW91–PW93): `metadata.mechaJono.psi.window`, its start, peak and end. */
  psiWindow?: PsiMissionWindow;
  /** The minutes its steps not yet done say they take. */
  effortMinutes?: number;
  /** What it asks, the steps not yet done. */
  steps: string[];
  /** Its safety limits, as one text (limitsOf). */
  limits?: string;
  where?: 'desk' | 'field';
  open: boolean;
  /** Published as a quick win. */
  quickWin: boolean;
  /** When this version was published, in ms. */
  publishedAt: number;
  pkg: AcceptedPackage;
}

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : undefined);
const asText = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const tagValue = (pkg: AcceptedPackage, name: string) => pkg.event.tags.find((t) => t[0] === name)?.[1];
const hasLabel = (pkg: AcceptedPackage, label: string) => pkg.event.tags.some((t) => t[0] === 't' && t[1] === label);

const MISSION_LINE = /^MISSION:\s*/;

const STAKES_CAP = 280;

/**
 * Two sentences at most: a card says why, the package says the rest. The text stops before a list, a
 * sentence that only introduces the list (it ends in a colon) is left out, and a paragraph with no sentence
 * break is cut at a word.
 */
function firstSentences(paragraph: string, n = 2): string {
  const beforeList = paragraph.split('\n').filter((line, i, all) => !all.slice(0, i + 1).some((l) => /^\s*[•*-]\s/.test(l))).join(' ');
  const said = beforeList.split(/(?<=[.!?])\s+(?=[A-Z0-9"'‘“(])/).filter((s) => !s.trim().endsWith(':')).slice(0, n).join(' ').trim();
  if (said.length <= STAKES_CAP) return said;
  return `${said.slice(0, STAKES_CAP).replace(/\s+\S*$/, '')}…`;
}

/** A jurisdiction (`us-nm`, `us`, `gb`) as a place. */
function placeOfJurisdiction(code: string | undefined): MissionPlace | undefined {
  const m = code?.trim().toLowerCase().match(/^([a-z]{2})(?:-([a-z0-9]{1,3}))?$/);
  if (!m) return undefined;
  if (m[1] === 'us' && m[2] && /^[a-z]{2}$/.test(m[2])) return { state: m[2].toUpperCase() };
  return { country: m[1].toUpperCase() };
}

function placeOf(profile: Shape | undefined, mechaJono: Shape | undefined): MissionPlace | undefined {
  const fieldWork = asShape(profile?.fieldWork);
  const area = asShape(mechaJono?.area);
  const base = placeOfJurisdiction(asText(fieldWork?.jurisdiction))
    ?? (asText(area?.state) && /^[A-Z]{2}$/.test(String(area?.state)) ? { state: String(area?.state) } : undefined)
    ?? placeOfJurisdiction(asText(area?.country));
  const areas = Array.isArray(area?.areas) ? (area.areas as unknown[]).filter((a): a is string => typeof a === 'string' && !!a.trim()) : [];
  if (!base && !areas.length) return undefined;
  return { ...base, ...(areas.length ? { areas } : {}) };
}

/**
 * A psi mission's window, as its manifest states it: unix seconds `from`, `peak` and `until` under
 * `metadata.mechaJono.psi.window` (their kit, schemas_psi 2.9). Undefined unless all three are numbers in order.
 */
export function psiWindowOf(mechaJono: unknown): PsiMissionWindow | undefined {
  const window = asShape(asShape(asShape(mechaJono)?.psi)?.window);
  const [from, peak, until] = [window?.from, window?.peak, window?.until];
  if (![from, peak, until].every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const [f, p, u] = [from, peak, until] as number[];
  if (!(f <= p && p <= u)) return undefined;
  return { fromMs: f * 1000, peakMs: p * 1000, untilMs: u * 1000 };
}

function closesAtOf(profile: Shape | undefined, mechaJono: Shape | undefined): number | undefined {
  const until = asShape(profile?.fieldWork)?.validUntil;
  if (typeof until === 'number' && Number.isFinite(until)) return until * 1000;
  const psi = psiWindowOf(mechaJono);
  if (psi) return psi.untilMs;
  const window = asText(asShape(mechaJono?.window)?.until);
  const ms = window ? Date.parse(window) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

export function missionCardOf(pkg: AcceptedPackage): MissionCard {
  const manifest = pkg.check.manifest;
  const mechaJono = asShape(asShape(manifest?.metadata)?.mechaJono);
  // The signed profile, or else what the tags state, as the panel reads it (packageProfile).
  const profile = asShape(statedProfile(pkg.event, manifest?.profile as PackageProfile | undefined));
  const name = asText(manifest?.name);
  const paragraphs = (manifest?.description ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const missionParagraph = paragraphs.find((p) => MISSION_LINE.test(p));
  const mission = asText(asShape(mechaJono?.format)?.mission) ?? (missionParagraph ? asText(missionParagraph.replace(MISSION_LINE, '')) : undefined);
  const stakesParagraph = paragraphs.find((p) => !MISSION_LINE.test(p));
  const headline = mission ?? name ?? '';
  const left = (manifest?.objectives ?? []).filter((ask) => !ask.done);
  const minutes = left.reduce((sum, ask) => sum + (typeof ask.effortMinutes === 'number' && ask.effortMinutes > 0 ? ask.effortMinutes : 0), 0);
  const d = tagValue(pkg, 'd');
  return {
    key: d ? `${pkg.event.pubkey}:${d}` : pkg.event.id,
    headline,
    ...(mission && name && name !== mission ? { subject: name } : {}),
    ...(stakesParagraph ? { stakes: firstSentences(stakesParagraph) } : {}),
    ...(placeOf(profile, mechaJono) ? { place: placeOf(profile, mechaJono) } : {}),
    ...(closesAtOf(profile, mechaJono) !== undefined ? { closesAt: closesAtOf(profile, mechaJono) } : {}),
    ...(psiWindowOf(mechaJono) ? { psiWindow: psiWindowOf(mechaJono) } : {}),
    ...(minutes > 0 ? { effortMinutes: minutes } : {}),
    steps: left.map((ask) => ask.ask.trim()).filter(Boolean),
    ...(limitsOf(pkg) ? { limits: limitsOf(pkg) } : {}),
    ...(hasLabel(pkg, 'where:field') || hasLabel(pkg, 'field_mission') ? { where: 'field' as const } : hasLabel(pkg, 'where:desk') ? { where: 'desk' as const } : {}),
    open: profile?.missionState !== 'closed',
    quickWin: hasLabel(pkg, 'variant:quick_win'),
    publishedAt: pkg.event.created_at * 1000,
    pkg,
  };
}

/**
 * A mission's safety limits: those its format states, or else every ask's, each said once (MF9: read and
 * agreed before it is taken). Undefined when it states none.
 */
export function limitsOf(pkg: AcceptedPackage): string | undefined {
  const manifest = pkg.check.manifest;
  const own = asText(asShape(asShape(asShape(manifest?.metadata)?.mechaJono)?.format)?.limits);
  if (own) return own;
  const fromAsks = [...new Set((manifest?.objectives ?? []).flatMap((ask) => ask.limits ?? []).map((l) => l.trim()).filter(Boolean))];
  return fromAsks.length ? fromAsks.join(' ') : undefined;
}

/** A grant notice: it belongs in the Market Exchange's Grants tab, not among missions (MF5). */
export function isGrantNotice(pkg: AcceptedPackage): boolean {
  return pkg.event.tags.some((t) => (t[0] === 'mission_family' && t[1] === 'grant') || (t[0] === 't' && t[1] === 'category:funding.grant'));
}

/**
 * What closes soonest first, then what can be done now (a quick win), then the newest; a mission whose end
 * has passed after those, and a closed one last.
 */
export function sortMissionCards<C extends Pick<MissionCard, 'open' | 'closesAt' | 'quickWin' | 'publishedAt'>>(cards: readonly C[], now: number): C[] {
  const rank = (c: C) => (!c.open ? 3 : c.closesAt !== undefined && c.closesAt < now ? 2 : c.closesAt !== undefined ? 0 : 1);
  return [...cards].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? a.closesAt! - b.closesAt! : 0)
    || (rank(a) === 1 ? Number(b.quickWin) - Number(a.quickWin) : 0)
    || b.publishedAt - a.publishedAt);
}
