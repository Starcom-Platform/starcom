/**
 * What a psi mission carries beyond any mission (decision D-PW, PW91–PW92): its window through time (the one window
 * timeline PsiOps and RLSH share), where the cursor stands against it, "Go to the peak", the window's places, the
 * engine and the registration; and, for the kit's sample, that it is one. Shown in the mission's card in Missions and
 * in the Lists panel's Missions tab. While shown, the window is marked on the time bar (missionWindowMark.ts).
 */
import React, { useEffect, useId } from 'react';
import { fill, useMessages } from '../../i18n/app/i18n';
import { useClockNow, useTemporalStateOptional } from '../../context/TemporalContext';
import { formatUtcDateTime } from '../../utils/utcTime';
import { DATA_SCALES } from '../../styles/tokens';
import { WindowTimeline } from './WindowTimeline';
import { windowStateAt, type PsiMission, type PsiWindowState } from '../../services/psiWatch/missions/psiMissions';
import { clearMissionWindow, markMissionWindow } from '../../features/psi/missionWindowMark';
import styles from './PsiMissionFacts.module.css';

/** The sky states' words say where a moment stands against a window: Ahead, In its window, Passed. */
const SKY_STATE: Record<PsiWindowState, 'armed' | 'live' | 'closed'> = { ahead: 'armed', open: 'live', passed: 'closed' };

export interface PsiMissionFactsProps {
  mission: PsiMission;
  /** Moves the shared cursor to the window's peak, and whatever else the place it is shown in does with it. */
  onGoToPeak: () => void;
  /** Said on hover of "Go to the peak", when it does more than move the cursor. */
  goToPeakTitle?: string;
  /** Where the card already says the kit's sample is one (its Signed by), not said again here. */
  sampleSaid?: boolean;
}

export const PsiMissionFacts: React.FC<PsiMissionFactsProps> = ({ mission, onGoToPeak, goToPeakTitle, sampleSaid = false }) => {
  const { m } = useMessages();
  const w = m.psiWatch.missions;
  const temporal = useTemporalStateOptional();
  const now = useClockNow();
  const cursorMs = temporal?.currentTime ?? now;
  const { window, curve } = mission;

  // Marked on the time bar while shown (PW92), as this one's own: closing it leaves another still open marked.
  const holder = useId();
  useEffect(() => {
    if (!window) return undefined;
    markMissionWindow(holder, { key: mission.address, title: mission.title, ...window });
    return () => clearMissionWindow(holder);
  }, [holder, mission.address, mission.title, window]);

  const state = window ? m.psiWatch.timeline.skyStates[SKY_STATE[windowStateAt(window, cursorMs)]] : null;
  const places = mission.windowNote?.zones.map((zone) => zone.name).filter(Boolean) ?? [];

  return (
    <section className={styles.facts} aria-label={w.heading} data-testid="psi-mission-facts">
      {window ? (
        <>
          <p className={styles.line} data-testid="psi-mission-window">
            {fill(w.window, {
              from: formatUtcDateTime(window.fromMs, { year: true }),
              until: formatUtcDateTime(window.untilMs, { year: true }),
              peak: formatUtcDateTime(window.peakMs, { year: true }),
            })}
          </p>
          {curve ? (
            <WindowTimeline
              window={curve}
              title={mission.title}
              hue={DATA_SCALES.psiWatch}
              updatedAt={mission.pkg.event.created_at}
              now={Math.floor(now / 1000)}
              cursor={Math.floor(cursorMs / 1000)}
              onSeek={temporal ? (unix) => temporal.setCurrentTime(unix * 1000) : undefined}
              peakWord="peak"
            />
          ) : null}
          <div className={styles.actions}>
            <span className={styles.state} data-testid="psi-mission-state">{fill(w.stateAt, { state: state ?? '' })}</span>
            <button type="button" className={styles.action} onClick={onGoToPeak} title={goToPeakTitle} data-testid="psi-mission-go-to-peak">
              {w.goToPeak}
            </button>
          </div>
        </>
      ) : null}
      {places.length ? <p className={styles.line}>{fill(m.psiWatch.panel.inPlaces, { places: places.join(', ') })}</p> : null}
      {mission.engine ? <p className={styles.quiet}>{fill(w.engine, { engine: mission.engine })}</p> : null}
      <p className={styles.quiet} data-testid="psi-mission-registration">
        {mission.registration
          ? fill(w.registration, { title: mission.registrationNote?.title || mission.registration })
          : w.noRegistration}
      </p>
      {mission.sample && !sampleSaid ? <p className={styles.quiet} data-testid="psi-mission-sample">{w.sample}</p> : null}
    </section>
  );
};

export default PsiMissionFacts;
