/**
 * A relay's light and the capacity gauge (BD11, BD12; interface-upgrade.md,
 * "Relay health"). ● OK, ◐ degraded, ✕ down, ◌ stale, each with its words; a
 * light greys by itself when its last answer is old, so an old check is never
 * shown as a live one.
 */
import type { NostrRelayState } from '../NostrStarcomIntelIngest';

/** A light greys once its relay's last answer is older than this (BD11). */
export const STALE_AFTER_MS = 120_000;

/** Relays answering that a publish needs (BD12): the config's MIN_RELAY_CONNECTIONS. */
export const RELAYS_NEEDED = 2;

export type RelayLightName = 'ok' | 'degraded' | 'down' | 'stale';

export interface RelayLight {
  light: RelayLightName;
  words: string;
}

const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function relayLight(r: Pick<NostrRelayState, 'connected' | 'lastAnsweredAt' | 'lastCheckFailedAt'>, now: number): RelayLight {
  if (!r.connected) return { light: 'down', words: 'down' };
  if (r.lastAnsweredAt !== undefined && now - r.lastAnsweredAt > STALE_AFTER_MS) {
    return { light: 'stale', words: `last answered ${ago(now - r.lastAnsweredAt)}` };
  }
  if (r.lastCheckFailedAt !== undefined && r.lastCheckFailedAt > (r.lastAnsweredAt ?? 0)) {
    return { light: 'degraded', words: 'connected, did not answer the last check' };
  }
  if (r.lastAnsweredAt === undefined) return { light: 'degraded', words: 'connected, not answered yet' };
  return { light: 'ok', words: `answered ${ago(now - r.lastAnsweredAt)}` };
}

export interface RelayCapacity {
  answering: number;
  needed: number;
  /** Green with room to spare, amber at exactly enough, red below (BD12). */
  level: 'ok' | 'caution' | 'danger';
  words: string;
}

export function relayCapacity(relays: ReadonlyArray<Pick<NostrRelayState, 'connected' | 'lastAnsweredAt' | 'lastCheckFailedAt'>>, now: number, needed = RELAYS_NEEDED): RelayCapacity {
  const answering = relays.filter((r) => relayLight(r, now).light === 'ok').length;
  const level = answering > needed ? 'ok' : answering === needed ? 'caution' : 'danger';
  return { answering, needed, level, words: `${answering} answering, ${needed} needed` };
}
