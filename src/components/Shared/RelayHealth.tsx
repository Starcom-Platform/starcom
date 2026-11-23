/**
 * Relay health and the capacity gauge (BD11, BD12; interface-upgrade.md,
 * "Relay health"): one light a relay, ● OK, ◐ degraded, ✕ down, ◌ stale, drawn
 * as shapes so colour is never the only signal, and each with its words. The
 * gauge is EVA's power bar: relays answering against the two a publish needs.
 */
import React from 'react';
import { relayCapacity, relayLight, type RelayLightName } from '../../services/intel/relays/relayHealth';
import type { NostrRelayState } from '../../services/intel/NostrStarcomIntelIngest';
import styles from './RelayHealth.module.css';

type Relay = Pick<NostrRelayState, 'url' | 'connected' | 'lastAnsweredAt' | 'lastCheckFailedAt'>;

const host = (url: string) => url.replace(/^wss?:\/\//, '').replace(/\/$/, '');

/** The light's shape: filled, half, a cross, dashed. */
const Mark: React.FC<{ light: RelayLightName; label: string }> = ({ light, label }) => (
  <svg viewBox="0 0 10 10" width="10" height="10" className={`${styles.mark} ${styles[light]}`} role="img" aria-label={label} data-light={light}>
    {light === 'ok' && <circle cx="5" cy="5" r="4" fill="currentColor" />}
    {light === 'degraded' && (
      <>
        <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 1.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
      </>
    )}
    {light === 'down' && <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    {light === 'stale' && <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.6 1.4" />}
  </svg>
);

export const RelayLights: React.FC<{ relays: readonly Relay[]; now: number }> = ({ relays, now }) => (
  <span className={styles.lights}>
    {relays.map((r) => {
      const { light, words } = relayLight(r, now);
      return <Mark key={r.url} light={light} label={`${host(r.url)}: ${words}`} />;
    })}
  </span>
);

export const RelayHealthList: React.FC<{ relays: readonly Relay[]; now: number }> = ({ relays, now }) => (
  <ul className={styles.list}>
    {relays.map((r) => {
      const { light, words } = relayLight(r, now);
      return (
        <li key={r.url} className={styles.row}>
          <Mark light={light} label={light} />
          <span className={styles.host}>{host(r.url)}</span>
          <span className={styles.words}>{words}</span>
        </li>
      );
    })}
  </ul>
);

const LEVEL_WORDS = { ok: 'room to spare', caution: 'just enough', danger: 'below what a publish needs' } as const;

export const CapacityGauge: React.FC<{ relays: readonly Relay[]; now: number }> = ({ relays, now }) => {
  const c = relayCapacity(relays, now);
  const cells = Math.max(relays.length, c.needed);
  return (
    <span
      className={`${styles.gauge} ${styles[c.level]}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={cells}
      aria-valuenow={c.answering}
      aria-label={`Publish capacity: ${c.words}, ${LEVEL_WORDS[c.level]}`}
      title={`Publish capacity: ${c.words}, ${LEVEL_WORDS[c.level]}`}
      data-level={c.level}
    >
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={`${styles.cell} ${i < c.answering ? styles.on : ''} ${i === c.needed - 1 ? styles.need : ''}`} />
      ))}
    </span>
  );
};
