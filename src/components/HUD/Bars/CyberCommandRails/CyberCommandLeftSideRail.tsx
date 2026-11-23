import React from 'react';
import { useQuakePings } from '../../../../services/quakes/quakePings';
import { Glyph } from '../../../../symbols/Glyph';
import type { VisualizationMode } from '../../../../context/VisualizationModeContext';
import { useVisualizationMode } from '../../../../context/VisualizationModeContext';
import { SECONDARY_RAIL_MODES } from './railModeConfig';
import { handleVerticalRailKeyNavigation } from './railKeyboardNavigation';
import styles from './CyberCommandLeftSideRail.module.css';

type CyberCommandSubMode = Extract<VisualizationMode, { mode: 'CyberCommand' }>['subMode'];
type GeoPoliticalSubMode = Extract<VisualizationMode, { mode: 'GeoPolitical' }>['subMode'];
type EcoNaturalSubMode = Extract<VisualizationMode, { mode: 'EcoNatural' }>['subMode'];
type RaverWatchSubMode = Extract<VisualizationMode, { mode: 'RaverWatch' }>['subMode'];
type HeroWatchSubMode = Extract<VisualizationMode, { mode: 'HeroWatch' }>['subMode'];
type AIWatchSubMode = Extract<VisualizationMode, { mode: 'AIWatch' }>['subMode'];
type MissionsSubMode = Extract<VisualizationMode, { mode: 'Missions' }>['subMode'];
type PsiWatchSubMode = Extract<VisualizationMode, { mode: 'PsiWatch' }>['subMode'];

/** A sub-mode chosen within its mode; the command palette chooses one too (D-CP). */
export const setSecondaryModeForPrimary = (
  mode: VisualizationMode['mode'],
  subMode: string,
  setVisualizationMode: (nextMode: VisualizationMode) => void
) => {
  if (mode === 'CyberCommand') {
    setVisualizationMode({ mode, subMode: subMode as CyberCommandSubMode });
    return;
  }

  if (mode === 'GeoPolitical') {
    setVisualizationMode({ mode, subMode: subMode as GeoPoliticalSubMode });
    return;
  }

  // Each mode by name: a fall-through saved every mode it did not name as EcoNatural.
  if (mode === 'RaverWatch') {
    setVisualizationMode({ mode, subMode: subMode as RaverWatchSubMode });
    return;
  }

  if (mode === 'HeroWatch') {
    setVisualizationMode({ mode, subMode: subMode as HeroWatchSubMode });
    return;
  }

  if (mode === 'AIWatch') {
    setVisualizationMode({ mode, subMode: subMode as AIWatchSubMode });
    return;
  }

  if (mode === 'Missions') {
    setVisualizationMode({ mode, subMode: subMode as MissionsSubMode });
    return;
  }

  if (mode === 'PsiWatch') {
    setVisualizationMode({ mode, subMode: subMode as PsiWatchSubMode });
    return;
  }

  setVisualizationMode({ mode: 'EcoNatural', subMode: subMode as EcoNaturalSubMode });
};

export const CyberCommandLeftSideRail: React.FC = () => {
  const { visualizationMode, setVisualizationMode } = useVisualizationMode();
  // New strong quakes not yet opened, counted on Eco Disasters' button (D-EQ, EQ20).
  const pinging = useQuakePings().length;
  const options = SECONDARY_RAIL_MODES[visualizationMode.mode];
  const modeButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const focusModeButton = (nextIndex: number) => {
    modeButtonRefs.current[nextIndex]?.focus();
  };

  return (
    <aside className={styles.rail} data-testid="cyber-left-side-rail" aria-label="Left side rail">
      <div className={styles.modeList}>
        {options.map(({ subMode, glyph, tooltip }, index) => (
          <button
            key={subMode}
            type="button"
            ref={(element) => {
              modeButtonRefs.current[index] = element;
            }}
            className={`${styles.modeButton} ${visualizationMode.subMode === subMode ? styles.modeButtonActive : ''}`}
            onClick={() => setSecondaryModeForPrimary(visualizationMode.mode, subMode, setVisualizationMode)}
            onKeyDown={(event) => handleVerticalRailKeyNavigation(event, index, options.length, focusModeButton)}
            aria-label={`${tooltip} secondary mode`}
            aria-pressed={visualizationMode.subMode === subMode}
            data-testid={`cyber-left-rail-mode-${subMode}`}
            title={tooltip}
          >
            <span aria-hidden="true"><Glyph name={glyph} /></span>
            {subMode === 'EcologicalDisasters' && pinging > 0 ? (
              <span className={styles.pingCount} title={`${pinging} new strong quake${pinging === 1 ? '' : 's'} not yet opened`}
                data-testid="cyber-left-rail-quake-pings">{pinging}</span>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  );
};

export default CyberCommandLeftSideRail;
