/**
 * Orbital assets, read from the same propagation the globe renders.
 *
 * ─── WHAT THIS PANEL USED TO DO ────────────────────────────────────────────
 *
 * `data?.satellites || [ ISS, HUBBLE, NOAA-20, GPS-IIF-12 ]` with hardcoded
 * altitudes, velocities, coordinates and next-pass times. The registrar passes
 * `data: { trackingMode: 'active', satelliteCount: 4 }` and no `satellites`
 * key, so the literal array was the only branch that ever ran — and it sat one
 * import away from `satelliteVisualizationService`, which was already loading
 * real CelesTrak TLEs and propagating them with SGP4 for the globe on the same
 * screen. The panel and the globe disagreed about where the ISS was, and the
 * globe was right.
 *
 * ─── WHY getCurrentPositions AND NOT getSatelliteData ──────────────────────
 *
 * `getSatelliteData()` deliberately returns `lat: 0, lng: 0` — its own comment
 * says "Will be updated in getPositions" — so a panel built on it would render
 * every satellite in the Gulf of Guinea and look plausible doing it. Positions
 * live on `getCurrentPositions()`, which is what useGlobeSatellites polls.
 *
 * It has a second advantage: `getSatelliteData()` falls back to three hardcoded
 * satellites (ISS at 0°,0°) when CelesTrak is unreachable. That fallback is
 * loudly logged but structurally indistinguishable from real data to a caller.
 * Reading positions instead means an unreachable feed produces an empty list —
 * which this panel reports as an empty list, rather than as three satellites.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { satelliteVisualizationService } from '../../../../services/Satellites/SatelliteVisualizationService';
import type { SatellitePosition, SatelliteInfo } from '../../../../services/Satellites/SatelliteDataManager';
import styles from './SatelliteTrackingPanel.module.css';
import { formatCount } from '@utils/formatCount';

/** How often to re-read propagated positions. Matches the globe's cadence. */
const POSITION_POLL_MS = 3000;

interface TrackedSatellite {
  id: string;
  name: string;
  type: string;
  country: string;
  altitudeKm: number;
  velocityKmh: number;
  lat: number;
  lng: number;
  nextPassUtc: string | null;
}

const formatUtc = (date: Date | null): string =>
  date ? `${date.toUTCString().slice(17, 25)} UTC` : '—';

const SatelliteTrackingPanel: React.FC = () => {
  const [tracked, setTracked] = useState<TrackedSatellite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<Date | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * Merge a propagated position with its catalogue entry.
   *
   * Both halves are real and neither is complete: the position carries
   * altitude/velocity/lat/lng from SGP4, the info carries name/type/country
   * from the TLE catalogue. A satellite with a position but no catalogue entry
   * is still shown — with its id as its name, rather than a guessed one.
   */
  const merge = useCallback((position: SatellitePosition, info: SatelliteInfo | null): TrackedSatellite => ({
    id: position.id,
    name: info?.name ?? position.id,
    type: info?.type ?? 'unknown',
    country: info?.country ?? 'unknown',
    altitudeKm: position.altitude,
    velocityKmh: position.velocity,
    lat: position.lat,
    lng: position.lng,
    // Only if the catalogue actually computed one. The old panel printed a
    // next-pass time for every satellite; this feed supplies it for some.
    nextPassUtc: info?.nextPass ? formatUtc(info.nextPass.time) : null,
  }), []);

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      try {
        const positions = satelliteVisualizationService.getCurrentPositions();
        if (cancelled) return;
        setTracked(positions.map((p) => merge(p, satelliteVisualizationService.getSatelliteInfo(p.id))));
        setLastRead(new Date());
        setFailure(null);
      } catch (error) {
        if (cancelled) return;
        // Reported, not swallowed into an empty list that would read as
        // "nothing in orbit".
        setFailure(error instanceof Error ? error.message : String(error));
      }
    };

    read();
    const timer = setInterval(read, POSITION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [merge]);

  const activeCount = tracked.length;

  const sorted = useMemo(
    () => [...tracked].sort((a, b) => a.altitudeKm - b.altitudeKm),
    [tracked]
  );

  return (
    <div className={styles.satellitePanel}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon}>🛰️</span>
          SATELLITE TRACKING
        </div>
        <div className={styles.timestamp}>{formatUtc(lastRead)}</div>
      </div>

      <div className={styles.trackingGrid}>
        {failure && (
          <div className={styles.satelliteCard}>
            <div className={styles.satelliteName}>PROPAGATION UNAVAILABLE</div>
            <div className={styles.purpose}>{failure}</div>
          </div>
        )}

        {!failure && sorted.length === 0 && (
          <div className={styles.satelliteCard}>
            <div className={styles.satelliteName}>NO PROPAGATED POSITIONS</div>
            <div className={styles.purpose}>
              No satellites are currently selected for propagation. Enable the
              satellite layer on the globe to populate this panel.
            </div>
          </div>
        )}

        {sorted.map((satellite) => (
          <div
            key={satellite.id}
            className={styles.satelliteCard}
            onClick={() => setSelectedId(selectedId === satellite.id ? null : satellite.id)}
          >
            <div className={styles.satelliteHeader}>
              <div className={styles.statusIcon}>🛰️</div>
              <div className={styles.satelliteId}>{satellite.id}</div>
              {/*
                * The old panel showed an operational/maintenance/offline badge
                * driven by a hardcoded literal. A TLE catalogue does not report
                * spacecraft health, so the badge is gone; the country of origin
                * is something the catalogue does report.
                */}
              <div className={styles.status}>{satellite.country.toUpperCase()}</div>
            </div>

            <div className={styles.satelliteName}>{satellite.name}</div>
            <div className={styles.purpose}>{satellite.type}</div>

            <div className={styles.telemetryData}>
              <div className={styles.dataRow}>
                <span className={styles.label}>ALT:</span>
                <span className={styles.value}>{formatCount(satellite.altitudeKm)} km</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>VEL:</span>
                <span className={styles.value}>{formatCount(satellite.velocityKmh)} km/h</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>LAT:</span>
                <span className={styles.value}>{satellite.lat.toFixed(2)}°</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>LNG:</span>
                <span className={styles.value}>{satellite.lng.toFixed(2)}°</span>
              </div>
            </div>

            {selectedId === satellite.id && (
              <div className={styles.expandedInfo}>
                <div className={styles.nextPass}>
                  <span className={styles.label}>Next Pass:</span>
                  {/* Absent for most satellites, and said so rather than filled in. */}
                  <span className={styles.passTime}>{satellite.nextPassUtc ?? 'not computed'}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.trackingStatus}>
          <div
            className={styles.statusLight}
            style={{ backgroundColor: failure ? '#888888' : activeCount > 0 ? '#00ff88' : '#ffaa00' }}
          />
          <span>{failure ? 'NO PROPAGATION' : `TRACKING ${activeCount}`}</span>
        </div>
        {/* Was `SAT> monitor_all`, which implied a command had been issued. */}
        <div className={styles.commandPrompt}>
          <span className={styles.prompt}>SOURCE&gt;</span>
          <span className={styles.command}>CelesTrak TLE · SGP4</span>
        </div>
      </div>
    </div>
  );
};

export default SatelliteTrackingPanel;
