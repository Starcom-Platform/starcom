/**
 * NavCom's return path, read (interchange spec rev 11; decision D-MX: MX1,
 * MX5): NIP-32 labels, kind 1985, in the namespace `navcom.mission`.
 *
 * NavCom's section 5 has five: `claimed`, signed by an operator taking part
 * in a package, which it names by its `a` coordinate; `released`, the same
 * operator letting it go (its rev 4, Q12; adopted, D-MX MX28); and `settled`,
 * `witnessed` and `challenged`, on an operator's report (kind 1912). Every
 * value is read, so nothing is dropped when reports come.
 *
 * A claim ends by itself at its NIP-40 `expiration`, and walking away from
 * one costs the operator nothing (NavCom's invariant 8): nothing here keeps a
 * label once it has expired, or keeps anything about a person at all.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';

/** NIP-32, as the review verdicts in `starcom.review` are; told apart by namespace. */
export const MISSION_LABEL_KIND = PROTOCOL_KINDS.NIP32_LABEL;
export const MISSION_LABEL_NAMESPACE = 'navcom.mission';

const VALUES = ['claimed', 'released', 'settled', 'witnessed', 'challenged'] as const;
export type MissionLabelValue = (typeof VALUES)[number];

export interface MissionLabel {
  id: string;
  /** Who signed it. A claim is the operator's own act; nothing else is known of them here. */
  pubkey: string;
  value: MissionLabelValue;
  /** The packages it names. */
  coordinates: string[];
  /** The report it is about, for settled, witnessed and challenged. */
  report?: string;
  /** Its own stated time, unix seconds. */
  createdAt: number;
  /** When it stops applying (NIP-40), unix seconds, if it says. */
  expiresAt?: number;
  /** The name an agent signs under, when an agent signed it. */
  agent?: string;
}

const first = (event: NostrEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1];

/** A label in `navcom.mission`, read; null for anything else, and for one already expired. */
export function readMissionLabel(event: NostrEvent, nowSeconds = Math.floor(Date.now() / 1000)): MissionLabel | null {
  if (event.kind !== MISSION_LABEL_KIND) return null;
  if (!event.tags.some((t) => t[0] === 'L' && t[1] === MISSION_LABEL_NAMESPACE)) return null;
  const values = event.tags
    .filter((t) => t[0] === 'l' && t[2] === MISSION_LABEL_NAMESPACE)
    .map((t) => t[1]);
  // One label each, as NavCom's spec writes them: two would say two things at once.
  if (values.length !== 1 || !(VALUES as readonly string[]).includes(values[0])) return null;
  const coordinates = event.tags.filter((t) => t[0] === 'a' && typeof t[1] === 'string' && t[1].trim()).map((t) => t[1]);
  if (coordinates.length === 0) return null;
  const expiration = Number(first(event, 'expiration'));
  const expiresAt = Number.isFinite(expiration) && expiration > 0 ? expiration : undefined;
  if (expiresAt !== undefined && expiresAt <= nowSeconds) return null;
  const report = first(event, 'e');
  const agent = first(event, 'agent');
  return {
    id: event.id,
    pubkey: event.pubkey,
    value: values[0] as MissionLabelValue,
    coordinates,
    ...(report ? { report } : {}),
    createdAt: event.created_at,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(agent ? { agent } : {}),
  };
}

export interface PackageClaim {
  pubkey: string;
  /** When the latest claim from this key was made, unix seconds. */
  at: number;
  agent?: string;
}

/**
 * Who has claimed this package, not let the claim expire and not released it: one entry per key, its latest claim.
 * A claim is a lease (NavCom rev 4, Q11): taking part again is a fresh claim, and the newest stands. A `released`
 * label from the same key, at or after its latest claim, lets the claim go (Q12). A count of claims on a package,
 * never anything about a person beyond it.
 */
export function claimsOn(labels: readonly MissionLabel[], coordinate: string, nowSeconds = Math.floor(Date.now() / 1000)): PackageClaim[] {
  const latest = new Map<string, PackageClaim>();
  const released = new Map<string, number>();
  for (const label of labels) {
    if (!label.coordinates.includes(coordinate)) continue;
    if (label.value === 'released') {
      released.set(label.pubkey, Math.max(released.get(label.pubkey) ?? 0, label.createdAt));
      continue;
    }
    if (label.value !== 'claimed') continue;
    if (label.expiresAt !== undefined && label.expiresAt <= nowSeconds) continue;
    const held = latest.get(label.pubkey);
    if (!held || label.createdAt > held.at) {
      latest.set(label.pubkey, { pubkey: label.pubkey, at: label.createdAt, ...(label.agent ? { agent: label.agent } : {}) });
    }
  }
  return [...latest.values()].filter((c) => (released.get(c.pubkey) ?? -1) < c.at).sort((a, b) => a.at - b.at);
}
