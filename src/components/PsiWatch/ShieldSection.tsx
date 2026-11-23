/**
 * The magnetic shield in the Psi Watch panel (decision D-PW, PW7, PW58): both dip poles where they stand at the
 * cursor and how far each moves a year, and the weakest field, inside the South Atlantic Anomaly; IGRF-14's span
 * said when the cursor is outside it; the aurora, NOAA's forecast for now, drawn only while the timeline is live.
 * The globe's own layer draws the same year (useShield).
 */
import React from 'react';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { useShield } from '../../services/psiWatch/shield/useShield';
import { poleSpeedKm } from '../../services/psiWatch/shield/shield';
import { shieldPlace, shieldWhen } from '../Globe/Hooks/useGlobeMagneticShield';
import styles from './PsiWatchPanel.module.css';

const ShieldSection: React.FC<{ cursorMs: number; live: boolean }> = ({ cursorMs, live }) => {
  const { m } = useMessages();
  const w = m.psiWatch.shield;
  const { at, failed } = useShield(true, cursorMs);
  if (!at) {
    return (
      <details open data-testid="psi-shield">
        <summary>{w.legendLayer}</summary>
        {failed ? <p role="status">{w.failed}</p> : <p className={styles.muted}>{w.loading}</p>}
      </details>
    );
  }
  const { shield, poles, year } = at;
  const km = (which: 'north' | 'south') => numbered(Math.round(poleSpeedKm(shield.tracks[which], year)));
  return (
    <details open data-testid="psi-shield">
      <summary>{fill(w.heading, { year: shieldWhen(at, w) })}</summary>
      {at.clamped ? <p className={styles.muted} data-testid="psi-shield-span">{at.clamped === 'before' ? w.before : w.after}</p> : null}
      <ul className={styles.list}>
        <li data-testid="psi-shield-north">{fill(w.northPole, { place: shieldPlace(poles.north.lat, poles.north.lon), km: km('north') })}</li>
        <li data-testid="psi-shield-south">{fill(w.southPole, { place: shieldPlace(poles.south.lat, poles.south.lon), km: km('south') })}</li>
        <li data-testid="psi-shield-aurora">{live ? w.auroraLive : w.auroraPaused}</li>
        <li data-testid="psi-shield-weakest">{fill(w.weakest, { nt: numbered(shield.weakest.total), place: shieldPlace(shield.weakest.lat, shield.weakest.lon) })}</li>
      </ul>
      <p className={styles.credit}>{w.credit}</p>
    </details>
  );
};

export default ShieldSection;
