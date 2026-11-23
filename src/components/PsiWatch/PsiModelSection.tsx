/**
 * The ψ field in the Psi Watch panel (decision D-PW, PW57, PW78–PW80): ψ at the observer (the globe's centre or the
 * place pinned), how much of the globe it stands above, and what the tides add or take there now; the core line's
 * year, said when the cursor is outside IGRF-14's span; an eclipse's band on its day; and the four looks, chosen here,
 * one or several. The globe's layer draws the same moment (usePsiField).
 */
import React from 'react';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { formatUtcDateTime, formatUtcTime } from '../../utils/utcTime';
import { usePsiField } from '../../services/psiWatch/psiField/usePsiField';
import { areaBelow, psiAt } from '../../services/psiWatch/psiField/field';
import { PSI_FIELD_LOOKS, setPsiFieldLook, usePsiFieldLooks } from '../../services/psiWatch/psiField/psiFieldLooks';
import { useObserverState } from '../../services/psiWatch/timestream/observer';
import { LAST_EPOCH } from '../../services/psiWatch/shield/useShield';
import { shieldPlace } from '../Globe/Hooks/useGlobeMagneticShield';
import styles from './PsiWatchPanel.module.css';

const two = (v: number) => numbered(Math.round(v * 100) / 100);

const PsiModelSection: React.FC<{ cursorMs: number }> = ({ cursorMs }) => {
  const { m } = useMessages();
  const w = m.psiWatch.psiModel;
  const { at, failed, clamped } = usePsiField(true, cursorMs);
  const looks = usePsiFieldLooks();
  const { observer } = useObserverState();
  if (!at) {
    return (
      <details open data-testid="psi-model">
        <summary>{w.legendLayer}</summary>
        {failed ? <p role="status">{w.failed}</p> : <p className={styles.muted}>{w.loading}</p>}
      </details>
    );
  }
  const reading = (() => {
    if (!observer) return <li className={styles.muted} data-testid="psi-model-observer">{w.noObserver}</li>;
    const place = shieldPlace(observer.lat, observer.lon);
    const psi = psiAt(at, observer.lat, observer.lon);
    if (psi < 0.005) return <li data-testid="psi-model-observer">{fill(w.nought, { place })}</li>;
    const tides = psi - psiAt({ mean: at.calmMean }, observer.lat, observer.lon);
    return (
      <>
        <li data-testid="psi-model-observer">
          {fill(w.atObserver, { value: two(psi), place, share: numbered(Math.round(areaBelow(at.psi, psi) * 100)) })}
        </li>
        {Math.abs(tides) >= 0.005 ? (
          <li data-testid="psi-model-tides">{fill(tides > 0 ? w.tidesRaise : w.tidesLower, { value: two(Math.abs(tides)) })}</li>
        ) : null}
      </>
    );
  })();
  return (
    <details open data-testid="psi-model">
      <summary>{fill(w.heading, { time: formatUtcDateTime(at.timeMs, { year: true }) })}</summary>
      <ul className={styles.list}>
        {reading}
        <li data-testid="psi-model-core">{fill(at.year > LAST_EPOCH ? w.coreForecast : w.core, { year: at.year })}</li>
        {clamped ? <li className={styles.muted} data-testid="psi-model-span">{clamped === 'before' ? w.coreBefore : w.coreAfter}</li> : null}
        {at.eclipse ? (
          <li data-testid="psi-model-eclipse">
            {fill(w.eclipse, {
              kind: (w.eclipseKinds as Record<string, string>)[at.eclipse.kind] ?? at.eclipse.kind,
              time: formatUtcTime(at.eclipse.peakMs),
            })}
          </li>
        ) : null}
      </ul>
      <p className={styles.subhead}>{w.looks}</p>
      <ul className={styles.looks} data-testid="psi-model-looks">
        {PSI_FIELD_LOOKS.map((look) => (
          <li key={look}>
            <button type="button" className={styles.pick} aria-pressed={looks[look]} title={w.lookTitles[look]}
              onClick={() => setPsiFieldLook(look, !looks[look])}>
              {w.lookNames[look]}
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.credit}>{w.credit}</p>
    </details>
  );
};

export default PsiModelSection;
