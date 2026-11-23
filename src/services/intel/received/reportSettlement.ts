/**
 * How a report sent from here stands (NavCom's mission interchange §5.3; decision D-MX, MX28 "align fully"): read
 * from the labels on it by NavCom's own rules (its `settlementOf`, packages/core/src/events/report.ts), so a report
 * reads the same here as in NavCom. Nothing here adjudicates: a challenge reverses nothing, and both it and the
 * settlement are shown for the reader to weigh.
 *
 * - `settled` counts only from the publisher's keys, none exposed: whoever holds an exposed secret could settle
 *   anything, and a report it would have settled settles by silence instead, which still counts.
 * - `witnessed` counts from anybody but the reporter. **The poster's settlement outranks a witness's** whenever
 *   both exist, whatever either claims about when: a timestamp is the signer's own to choose.
 * - With neither, it settles by silence once seven days have passed from the report's day.
 * - `challenged` counts from anybody but the reporter, dated before the seven days end. The window is half-open:
 *   the moment it settles is the moment challenges stop counting.
 * - A label dated more than a day past the reader's clock is not read: it is from a clock nobody shares.
 * - No label from an exposed key is read, whichever word it says: its `witnessed` would settle a report, and its
 *   `challenged` stand beside one, under the publisher's own name.
 *
 * A rotating publisher's key speaks only from its start (KEY_STARTS), and a label it signed dated before then is not
 * read either: Mecha Jono signs nothing with its next key before the cut-over, so anything under it before then is a
 * thief's.
 */
import type { MissionLabel } from '../missionLabels';
import { ROTATING_PUBLISHERS, speaksFor, startOf, type KeyRecords } from '../../nostr/publisherKeys';

/** The seven days a report waits for a challenge before it settles by itself. */
export const CHALLENGE_WINDOW_S = 7 * 86_400;
/** A label dated further ahead of this clock than this is not read. */
const FUTURE_TOLERANCE_S = 86_400;

export type Settlement =
  | { state: 'pending'; until: number; challengedBy: string[] }
  | { state: 'settled'; how: 'poster' | 'witness'; by: string; at: number; challengedBy: string[] }
  | { state: 'settled'; how: 'silence'; at: number; challengedBy: string[] };

/** The keys whose `settled` counts on a mission `poster` posted: its publisher's keys that speak at `at`. */
export function settlersOf(poster: string, at: number, records: KeyRecords = {}): ReadonlySet<string> {
  const key = poster.toLowerCase();
  const keys = (records.publishers ?? ROTATING_PUBLISHERS).find((p) => p.keys.some((k) => k.toLowerCase() === key))?.keys ?? [key];
  return new Set(keys.map((k) => k.toLowerCase()).filter((k) => speaksFor(k, at, records)));
}

/**
 * Whether a label is read at all, as NavCom's `labelHeard`: from a key that speaks at `at`, and, for a rotating
 * publisher's key, signed no earlier than its start. Anyone else's key is heard unless exposed.
 */
export const labelHeard = (at: number, records: KeyRecords = {}) => (pubkey: string, signedAt: number): boolean => {
  if (!speaksFor(pubkey, at, records)) return false;
  const start = startOf(pubkey, records.starts);
  return Number.isNaN(start) || signedAt >= start;
};

/** Where a report stands, from the labels on it. `report.at` is its own time, the start of its day; `now` in seconds. */
export function settlementOf(
  report: { id: string; author: string; at: number },
  settlers: ReadonlySet<string>,
  labels: readonly MissionLabel[],
  now: number,
  heard: (pubkey: string, signedAt: number) => boolean = labelHeard(now),
): Settlement {
  const until = report.at + CHALLENGE_WINDOW_S;
  const latest = now + FUTURE_TOLERANCE_S;
  let byPoster: { by: string; at: number } | null = null;
  let byWitness: { by: string; at: number } | null = null;
  const challengedBy: string[] = [];
  for (const label of labels) {
    if (label.report !== report.id || label.createdAt > latest || !heard(label.pubkey, label.createdAt)) continue;
    const at = label.createdAt;
    if (label.value === 'settled' && settlers.has(label.pubkey)) {
      if (!byPoster || at < byPoster.at) byPoster = { by: label.pubkey, at };
    } else if (label.value === 'witnessed' && label.pubkey !== report.author) {
      if (!byWitness || at < byWitness.at) byWitness = { by: label.pubkey, at };
    } else if (label.value === 'challenged' && label.pubkey !== report.author && at < until) {
      if (!challengedBy.includes(label.pubkey)) challengedBy.push(label.pubkey);
    }
  }
  if (byPoster) return { state: 'settled', how: 'poster', by: byPoster.by, at: byPoster.at, challengedBy };
  if (byWitness) return { state: 'settled', how: 'witness', by: byWitness.by, at: byWitness.at, challengedBy };
  if (now >= until) return { state: 'settled', how: 'silence', at: until, challengedBy };
  return { state: 'pending', until, challengedBy };
}
