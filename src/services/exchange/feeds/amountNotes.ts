/**
 * The amounts programmes publish, through Mecha Jono's notes (critique C12, CR2; the owner chose Mecha Jono for
 * both on 2026-10-16). A reward programme states its amounts notice by notice, beside a person's name, and
 * Grants.gov states an award's ceiling only on each opportunity: neither is read here. Mecha Jono reads them and
 * posts what they state, as counts and figures, never a name:
 *
 *   reward_amounts, a note per programme (`d=reward-amounts-<fbi|rfj>`):
 *     ["programme", "fbi"]  ["notices", "1264"]  ["stated", "312"]  ["as_of", "2026-10-16"]
 *     ["up_to", "10000", "182"]   one per amount the notices state "up to", in US dollars, with how many state it
 *
 *   award_amounts, one note (`d=award-amounts-grants-gov`):
 *     ["as_of", "2026-10-16"]
 *     ["award", "<opportunity number>", "<ceiling>", "<floor>"]   in US dollars, an empty string for one not stated
 *
 * Both kind 30023 on The Record, from Mecha Jono's keys. The newest note at an address stands, and `t=retracted`
 * withdraws it. Until a note is there, the board says none is listed here yet.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { boardFeedRelays } from '../../nostr/publishTargets';
import { createRelayPool } from '../../nostr/relayPool';
import { readNotesOnce } from '../../nostr/readNotesOnce';
import { RECORD_WAIT_MS } from './sanctionsChanges';

export const REWARD_AMOUNTS_TOPIC = 'reward_amounts';
export const AWARD_AMOUNTS_TOPIC = 'award_amounts';

/** What a reward programme's notices state, counted. */
export interface RewardAmounts {
  programme: 'fbi' | 'rfj';
  /** Notices open, and how many of them state an amount. */
  notices: number;
  stated: number;
  /** Each "up to" amount the notices state, in US dollars, with how many state it, most stated first. */
  upTo: Array<{ usd: number; notices: number }>;
  /** The day the notices were read, YYYY-MM-DD. */
  asOf: string;
}

/** An opportunity's award, as Grants.gov lists it. */
export interface AwardAmount {
  ceiling?: number;
  floor?: number;
}

export interface AmountNotes {
  rewards: ReadonlyMap<string, RewardAmounts>;
  /** By opportunity number. */
  awards: ReadonlyMap<string, AwardAmount>;
  awardsAsOf?: string;
}

export const NO_AMOUNTS: AmountNotes = { rewards: new Map(), awards: new Map() };

const tagsOf = (event: Event, name: string) => event.tags.filter((t) => t[0] === name);
const first = (event: Event, name: string): string | undefined => tagsOf(event, name)[0]?.[1];
const usd = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const count = (value: string | undefined): number | undefined => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function topicsOf(event: Event): string[] {
  return tagsOf(event, 't').map((t) => t[1]);
}

/** A reward_amounts note, or null for one that is not one or does not read. */
export function readRewardAmountsNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): RewardAmounts | 'retracted' | null {
  if (event.kind !== 30023 || !publishers.includes(event.pubkey) || !topicsOf(event).includes(REWARD_AMOUNTS_TOPIC)) return null;
  if (topicsOf(event).includes('retracted')) return 'retracted';
  const programme = first(event, 'programme');
  const notices = count(first(event, 'notices'));
  const stated = count(first(event, 'stated'));
  const asOf = first(event, 'as_of') ?? '';
  if ((programme !== 'fbi' && programme !== 'rfj') || notices === undefined || stated === undefined || !DAY.test(asOf)) return null;
  const upTo = tagsOf(event, 'up_to')
    .flatMap(([, amount, n]) => {
      const value = usd(amount);
      const many = count(n);
      return value !== undefined && many ? [{ usd: value, notices: many }] : [];
    })
    .sort((a, b) => b.notices - a.notices || b.usd - a.usd);
  if (!upTo.length) return null;
  return { programme, notices, stated, upTo, asOf };
}

/** An award_amounts note's awards by opportunity number, or null. */
export function readAwardAmountsNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): { asOf: string; awards: Map<string, AwardAmount> } | 'retracted' | null {
  if (event.kind !== 30023 || !publishers.includes(event.pubkey) || !topicsOf(event).includes(AWARD_AMOUNTS_TOPIC)) return null;
  if (topicsOf(event).includes('retracted')) return 'retracted';
  const asOf = first(event, 'as_of') ?? '';
  if (!DAY.test(asOf)) return null;
  const awards = new Map<string, AwardAmount>();
  for (const [, number, ceiling, floor] of tagsOf(event, 'award')) {
    const award = { ...(usd(ceiling) !== undefined ? { ceiling: usd(ceiling) } : {}), ...(usd(floor) !== undefined ? { floor: usd(floor) } : {}) };
    if (number && (award.ceiling !== undefined || award.floor !== undefined)) awards.set(number.trim(), award);
  }
  return awards.size ? { asOf, awards } : null;
}

/** The newest note at each address stands; a retraction withdraws it. */
export function amountsFrom(events: readonly Event[], publishers: readonly string[] = MECHA_JONO_KEYS): AmountNotes {
  const newest = new Map<string, Event>();
  for (const event of events) {
    const d = first(event, 'd');
    if (!d || !publishers.includes(event.pubkey)) continue;
    const key = `${event.pubkey}:${d}`;
    const held = newest.get(key);
    if (!held || event.created_at > held.created_at) newest.set(key, event);
  }
  const rewards = new Map<string, RewardAmounts>();
  const awards = new Map<string, AwardAmount>();
  let awardsAsOf: string | undefined;
  for (const event of newest.values()) {
    const reward = readRewardAmountsNote(event, publishers);
    if (reward && reward !== 'retracted') rewards.set(reward.programme, reward);
    const award = readAwardAmountsNote(event, publishers);
    if (award && award !== 'retracted') {
      for (const [number, amount] of award.awards) awards.set(number, amount);
      awardsAsOf = award.asOf;
    }
  }
  return { rewards, awards, ...(awardsAsOf ? { awardsAsOf } : {}) };
}

export interface AmountSources {
  pool?: Pick<SimplePool, 'subscribeMany'>;
  relays?: string[];
  waitMs?: number;
}

/** Mecha Jono's amount notes, as many as arrive in the wait; none is no amounts, said so on the board. */
export async function readAmountNotes(sources: AmountSources = {}): Promise<AmountNotes> {
  const events = await readNotesOnce(
    sources.pool ?? createRelayPool(),
    sources.relays ?? boardFeedRelays(),
    { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': [REWARD_AMOUNTS_TOPIC, AWARD_AMOUNTS_TOPIC] } satisfies Filter,
    sources.waitMs ?? RECORD_WAIT_MS,
  );
  return amountsFrom(events);
}
