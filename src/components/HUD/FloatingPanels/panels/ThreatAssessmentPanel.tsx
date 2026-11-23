/**
 * Space-hazard alerts, read from the live NOAA feed.
 *
 * ─── WHAT THIS PANEL USED TO DO ────────────────────────────────────────────
 *
 * `data?.threats || [ ...three literal threats... ]`. FloatingPanelRegistrar
 * registers this panel with `data: { alertLevel: 'orange', threatCount: 3 }`
 * and no `threats` key, so the fallback was not a fallback — it was the only
 * branch that ever ran. Every operator who opened this panel was shown
 * "Class X2.4 solar flare detected with Earth-directed CME", 87% probability,
 * ETA 02:34:17, counting down against a live clock.
 *
 * None of it was real, and the panel is reachable from the HUD.
 *
 * That was survivable while it stayed on one screen. It stops being survivable
 * the moment Starcom can produce a shareable image of its own interface: a
 * screenshot does not carry the caveat that the numbers were placeholders, and
 * this application's entire proposition is that its claims are derived and
 * checkable rather than asserted.
 *
 * ─── WHY THE DISPLAY LOST FIELDS ───────────────────────────────────────────
 *
 * The invented threats carried `eta`, `probability` and `recommendations`. The
 * real feed provides none of the three — NOAA's electric-field product yields a
 * severity, a type, affected regions and a message, and that is all. Rather
 * than keep the fields and fill them with something, the fields are gone. A
 * panel that shows less than it used to, and means all of it, is the trade.
 *
 * The three action buttons went with them: they had no handler, so "Alert Team"
 * alerted nobody.
 *
 * ─── AND WHAT REPLACED THAT WAS NOT NOAA'S EITHER ──────────────────────────
 *
 * The fix above read "alerts from the live NOAA feed" in "NOAA's severity
 * vocabulary". They were neither. generateSpaceWeatherAlerts() made them in
 * Starcom from NOAA's electric-field grids: Starcom's thresholds (1,000 to 5,000
 * mV/km), Starcom's labels ("infrastructure_risk"), each stamped with the time it
 * was computed. Keeping the panel supplied meant fetching both grids — 1.98 MB —
 * on every page load, measured with no Space Weather layer on screen.
 *
 * NOAA publishes its own assessment: the Space Weather Scales (R, S, G, 0-5) and
 * the alerts, watches and warnings SWPC issues. This shows those, as issued, and
 * fetches them only while the panel is open.
 */
import React, { useMemo } from 'react';
import { useNoaaSpaceWeatherSummary } from '../../../../hooks/useNoaaSpaceWeatherSummary';
import type { NoaaOfficialAlert, NoaaScaleName } from '../../../../services/space-weather/noaaSummary';
import styles from './ThreatAssessmentPanel.module.css';

type AlertLevel = 'green' | 'yellow' | 'orange' | 'red';

/** From the highest current NOAA scale: 0 none, 1-2 minor/moderate, 3 strong, 4-5 severe/extreme. */
const levelForScale = (level: number): AlertLevel =>
  level >= 4 ? 'red' : level === 3 ? 'orange' : level >= 1 ? 'yellow' : 'green';

const LEVEL_COLORS: Record<AlertLevel, string> = {
  red: '#ff0000',
  orange: '#ff6600',
  yellow: '#ffff00',
  green: '#00ff88',
};

const SCALE_NAMES: Record<NoaaScaleName, string> = {
  R: 'Radio blackout',
  S: 'Solar radiation storm',
  G: 'Geomagnetic storm',
};

/** How far back an official message counts as current, measured from NOAA's own time. */
const RECENT_MS = 24 * 60 * 60 * 1000;

const formatUtc = (when: string | Date | null | undefined): string => {
  if (!when) return '—';
  const date = when instanceof Date ? when : new Date(when);
  return Number.isNaN(date.getTime()) ? '—' : `${date.toISOString().slice(5, 16).replace('T', ' ')} UTC`;
};

const ThreatAssessmentPanel: React.FC = () => {
  const { summary, loading, error } = useNoaaSpaceWeatherSummary(true);

  /**
   * Messages issued in the 24 hours before NOAA's own timestamp — measured from
   * the data, not the clock, so a panel left open does not quietly empty.
   */
  const recent = useMemo<NoaaOfficialAlert[]>(() => {
    if (!summary) return [];
    const now = Date.parse(summary.observedAt);
    return summary.alerts.filter((a) => {
      const age = now - Date.parse(a.issuedAt);
      return age >= 0 && age <= RECENT_MS;
    });
  }, [summary]);

  // The level is NOAA's, from its scales — not a count, and not panel data.
  const alertLevel = useMemo<AlertLevel>(
    () => levelForScale(Math.max(0, ...(summary?.scales.map((s) => s.level) ?? [0]))),
    [summary],
  );

  // An unreachable feed is not a quiet sky. With nothing ever loaded, there is no level to show.
  const feedDown = Boolean(error) && !summary;

  return (
    <div className={styles.threatPanel}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon}>🛡️</span>
          THREAT ASSESSMENT
        </div>
        <div
          className={styles.alertLevel}
          style={{ color: feedDown || !summary ? '#888888' : LEVEL_COLORS[alertLevel] }}
        >
          {feedDown ? 'ALERT: UNKNOWN' : summary ? `ALERT: ${alertLevel.toUpperCase()}` : 'ALERT: …'}
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.timestamp}>{formatUtc(summary?.observedAt)}</div>
        <div className={styles.threatCount}>
          {feedDown ? 'NO FEED' : `${recent.length} NOAA MESSAGE${recent.length === 1 ? '' : 'S'} · 24H`}
        </div>
      </div>

      <div className={styles.threatList}>
        {feedDown && (
          <div className={styles.threatCard}>
            <div className={styles.threatType}>FEED UNAVAILABLE</div>
            <div className={styles.description}>{error}</div>
            <div className={styles.description}>
              No assessment can be made while NOAA cannot be reached. This is not an all-clear.
            </div>
          </div>
        )}

        {!summary && !feedDown && loading && (
          <div className={styles.threatCard}>
            <div className={styles.threatType}>ACQUIRING</div>
            <div className={styles.description}>Fetching NOAA's scales and alerts…</div>
          </div>
        )}

        {summary && summary.scales.map((s) => (
          <div key={s.scale} className={styles.threatCard}>
            <div className={styles.threatHeader}>
              <div className={styles.threatId}>{s.scale}{s.level}</div>
              <div className={styles.severity} style={{ color: LEVEL_COLORS[levelForScale(s.level)] }}>
                {(s.text || '—').toUpperCase()}
              </div>
            </div>
            <div className={styles.threatType}>{SCALE_NAMES[s.scale].toUpperCase()}</div>
          </div>
        ))}

        {summary && recent.length === 0 && (
          <div className={styles.threatCard}>
            <div className={styles.threatType}>NO NOAA MESSAGES IN 24 HOURS</div>
            <div className={styles.description}>
              SWPC issued no alerts, watches or warnings in the 24 hours to {formatUtc(summary.observedAt)}.
            </div>
          </div>
        )}

        {recent.map((a) => (
          <div key={`${a.productId}-${a.issuedAt}`} className={styles.threatCard}>
            <div className={styles.threatHeader}>
              <div className={styles.threatId}>{a.productId}</div>
              <div className={styles.severity}>{formatUtc(a.issuedAt)}</div>
            </div>
            <div className={styles.description}>{a.headline}</div>
          </div>
        ))}

        {summary && error && (
          <div className={styles.description}>Last refresh failed ({error}); showing NOAA's data as of {formatUtc(summary.observedAt)}.</div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.systemStatus}>
          <div
            className={styles.statusLight}
            style={{ backgroundColor: feedDown || !summary ? '#888888' : LEVEL_COLORS[alertLevel] }}
          />
          <span>{feedDown ? 'FEED DOWN' : 'NOAA SWPC'}</span>
        </div>
        <div className={styles.commandLine}>
          <span className={styles.prompt}>SOURCE&gt;</span>
          <span className={styles.command}>NOAA SWPC scales and alerts, as issued</span>
        </div>
      </div>
    </div>
  );
};

export default ThreatAssessmentPanel;
