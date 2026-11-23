/**
 * Reward programmes, not people (decision D-BF, BF3): how many notices each programme has open, by
 * kind; what it pays for, who decides, and where a tip goes. No name, photo or description is shown,
 * and notices about missing people, kidnappings, hostages or children are never counted. No amount:
 * a programme sets its own, notice by notice.
 *
 * Both are read by the browser when the board opens, and each count is one small request:
 * - the FBI's Wanted API, a total per poster classification. It sends one notice beside each total,
 *   whatever is asked (no `fields`, and `pageSize=0` sends no total); that notice is never read here.
 * - Rewards for Justice's own site: each category's count, from its taxonomy terms, which carry no
 *   notice at all; and its total less hostage cases, from `X-WP-Total` on a list of ids only.
 *
 * Rewards for Justice's CDN keeps an answer an hour with the CORS header of whichever site asked first,
 * and does not vary it by site: on 2026-10-13 a probe from a local build locked starcom.app out. Each
 * request names the asking site's host (`starcom_origin`), which WordPress ignores and the CDN keys on,
 * so each site gets its own copy.
 */
import type { Archetype } from '../opportunityAudience';

export interface RewardKind {
  key: string;
  label: string;
  count: number;
}

export interface RewardProgramme {
  id: 'fbi' | 'rfj';
  name: string;
  /** What it pays for, in its own terms. */
  paysFor: string;
  /** The law it rests on, where the programme names one. */
  basis?: string;
  decidedBy: string;
  reference: string;
  tip: { label: string; url: string };
  /** Notices open, the kinds left out not among them. */
  total: number;
  kinds: RewardKind[];
  /** What is never counted, said so. */
  leftOut: string;
  audiences: Archetype[];
}

export const FBI_WANTED_URL = 'https://api.fbi.gov/wanted/v1/list';
export const RFJ_API = 'https://rewardsforjustice.net/wp-json/wp/v2';

/** The FBI's poster classifications counted, in its own words. `missing`, `kidnapping` and `ecap` are not. */
export const FBI_KINDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'ten', label: 'Ten Most Wanted' },
  { key: 'terrorist', label: 'Most Wanted Terrorists' },
  { key: 'fraudster', label: 'Most wanted white-collar fugitives' },
  { key: 'information', label: 'Seeking information' },
  { key: 'default', label: 'Other wanted notices' },
];

/** Rewards for Justice's categories counted: its taxonomies and the terms read from each. Hostages are not. */
export const RFJ_KINDS: ReadonlyArray<{ taxonomy: string; slugs: string[]; label: string }> = [
  { taxonomy: 'crime-category', slugs: ['terrorism-financing'], label: 'Terrorism financing' },
  { taxonomy: 'crime-category', slugs: ['acts-of-terrorism'], label: 'Acts of terrorism' },
  { taxonomy: 'cyber', slugs: ['critical-infrastructure', 'critical-infrastructure-individual'], label: 'Cyber attacks on critical infrastructure' },
  { taxonomy: 'dprk', slugs: ['north-korea', 'north-korea-individual'], label: 'North Korea' },
  { taxonomy: 'election-interference', slugs: ['election-interference', 'election-interference-individual'], label: 'Election interference' },
];

export interface RewardSources {
  /** JSON from a URL. */
  json: (url: string) => Promise<unknown>;
  /** A response's header, for Rewards for Justice's total. */
  header: (url: string, name: string) => Promise<string | null>;
}

const defaults: RewardSources = {
  json: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    return response.json();
  },
  header: async (url, name) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    return response.headers.get(name);
  },
};

const countOf = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0) throw new Error('a count did not read');
  return n;
};

export async function readFbiProgramme(sources: RewardSources = defaults): Promise<RewardProgramme> {
  const kinds = await Promise.all(FBI_KINDS.map(async ({ key, label }) => {
    const answer = await sources.json(`${FBI_WANTED_URL}?pageSize=1&poster_classification=${key}`);
    // Only the total. The notice it sends beside it is not read.
    return { key, label, count: countOf((answer as { total?: unknown })?.total) };
  }));
  return {
    id: 'fbi',
    name: 'FBI rewards',
    paysFor: 'Information leading to an arrest, or to identifying a person the FBI seeks. A notice says whether it carries a reward.',
    decidedBy: 'the FBI',
    reference: 'https://www.fbi.gov/wanted',
    tip: { label: 'tips.fbi.gov, or 1-800-CALL-FBI', url: 'https://tips.fbi.gov/' },
    total: kinds.reduce((sum, kind) => sum + kind.count, 0),
    kinds: kinds.filter((kind) => kind.count > 0),
    leftOut: 'Notices about missing people, kidnappings and endangered children are not counted here.',
    audiences: ['reward_hunter', 'recovery_agent', 'private_investigator'],
  };
}

interface Term { id?: unknown; slug?: unknown; count?: unknown }

/** The asking site's host, so the CDN keeps a copy of each answer per site. */
export function rfjOriginParam(host: string | undefined = globalThis.location?.host): string {
  return `&starcom_origin=${encodeURIComponent(host || 'starcom')}`;
}

export async function readRfjProgramme(sources: RewardSources = defaults, origin = rfjOriginParam()): Promise<RewardProgramme> {
  const taxonomies = [...new Set(RFJ_KINDS.map((k) => k.taxonomy)), 'hostages-kidnapping'];
  const terms = new Map(await Promise.all(taxonomies.map(async (taxonomy) => {
    const answer = await sources.json(`${RFJ_API}/${taxonomy}?per_page=100&_fields=id,slug,count${origin}`);
    if (!Array.isArray(answer)) throw new Error(`Rewards for Justice sent no ${taxonomy} terms`);
    return [taxonomy, answer as Term[]] as const;
  })));
  const kinds = RFJ_KINDS.map(({ taxonomy, slugs, label }) => ({
    key: slugs[0],
    label,
    count: (terms.get(taxonomy) ?? []).filter((t) => slugs.includes(String(t.slug))).reduce((sum, t) => sum + countOf(t.count), 0),
  }));
  const hostageIds = (terms.get('hostages-kidnapping') ?? []).map((t) => countOf(t.id)).join(',');
  const total = countOf(await sources.header(
    `${RFJ_API}/rewards?per_page=1&_fields=id${hostageIds ? `&hostages-kidnapping_exclude=${hostageIds}` : ''}${origin}`,
    'X-WP-Total',
  ));
  return {
    id: 'rfj',
    name: 'Rewards for Justice',
    paysFor: 'Information on terrorism and its financing, North Korea’s illicit finance, malicious cyber activity against critical infrastructure, and foreign election interference.',
    basis: '22 U.S.C. §2708 (the 1984 Act to Combat International Terrorism)',
    decidedBy: 'the U.S. Secretary of State',
    reference: 'https://rewardsforjustice.net/about/program-overview/',
    tip: { label: 'Rewards for Justice: Signal, Telegram or Tor', url: 'https://rewardsforjustice.net/' },
    total,
    kinds: kinds.filter((kind) => kind.count > 0),
    leftOut: 'Hostage and kidnapping cases are not counted here. A notice can fall under several kinds.',
    audiences: ['reward_hunter', 'sanctions_researcher', 'whitehat'],
  };
}

/** Both programmes; one that does not answer is left out, and named. */
export async function readRewardProgrammes(sources: RewardSources = defaults): Promise<{ programmes: RewardProgramme[]; failed: string[] }> {
  const read = await Promise.allSettled([readFbiProgramme(sources), readRfjProgramme(sources)]);
  return {
    programmes: read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    failed: read.flatMap((r, i) => (r.status === 'rejected' ? [i === 0 ? 'FBI' : 'Rewards for Justice'] : [])),
  };
}
