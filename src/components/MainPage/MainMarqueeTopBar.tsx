import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { usePrimaryMarqueeData, type PrimaryMarqueeSignal } from './usePrimaryMarqueeData';
import styles from './MainMarqueeTopBar.module.css';
import { usePopup } from '../Popup/PopupManager';
import SystemStatusPanel from './SystemStatusPanel';
import { GlobeTickerExtras } from './GlobeTickerExtras';

const AnimatedSignalItem: React.FC<{ signal: PrimaryMarqueeSignal }> = ({ signal }) => {
  const [currentValue, setCurrentValue] = useState(signal.value);
  const [previousValue, setPreviousValue] = useState(signal.value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [valueWidthCh, setValueWidthCh] = useState(Math.max(signal.value.length + 2, 9));
  // Read through a ref, not a dependency: with currentValue among the effect's
  // dependencies, setting it re-ran the effect, whose cleanup cleared the timer
  // that ends the animation, so every readout that ever changed stayed
  // "animating" with its old value beside the new one (plan item 1.8).
  const shownValue = useRef(signal.value);

  useEffect(() => {
    if (signal.value === shownValue.current) {
      return;
    }

    setPreviousValue(shownValue.current);
    shownValue.current = signal.value;
    setCurrentValue(signal.value);
    setValueWidthCh((prev) => Math.max(prev, signal.value.length + 2));
    setIsAnimating(true);

    const animationTimer = setTimeout(() => {
      setIsAnimating(false);
      setValueWidthCh(Math.max(signal.value.length + 2, 9));
    }, 260);

    return () => clearTimeout(animationTimer);
  }, [signal.value]);

  return (
    <span className={styles.marqueeItem}>
      <span className={styles.marqueeLabel}>{signal.label}:</span>{' '}
      <span
        className={`${styles.marqueeValueSlot} ${isAnimating ? styles.animating : ''}`}
        style={{ '--value-width-ch': `${valueWidthCh}ch` } as React.CSSProperties}
      >
        <span className={`${styles.marqueeValueLayer} ${styles.currentValue}`}>{currentValue}</span>
        {/* The value before a change, only while it animates out, and never read:
            kept in the page, hidden by colour alone, it had the page say "TOTAL 1"
            and "TOTAL 0" at once (plan item 1.8). */}
        {isAnimating && (
          <span className={`${styles.marqueeValueLayer} ${styles.previousValue}`} aria-hidden="true">{previousValue}</span>
        )}
      </span>
    </span>
  );
};

const MainMarqueeTopBar: React.FC = () => {
  const { title, signals: screenSignals, onGlobe, section } = usePrimaryMarqueeData();
  const { showPopup } = usePopup();
  // The Globe's energy readings, those the visitor has (K4): the one ticker carries them.
  const [energySignals, setEnergySignals] = useState<PrimaryMarqueeSignal[]>([]);
  const signals = useMemo(
    () => (onGlobe ? [...screenSignals, ...energySignals] : screenSignals),
    [onGlobe, screenSignals, energySignals],
  );
  const marqueeContentRef = useRef<HTMLDivElement | null>(null);

  const [renderedSignals, setRenderedSignals] = useState<PrimaryMarqueeSignal[]>(signals);
  const pendingSignalsRef = useRef<PrimaryMarqueeSignal[]>(signals);

  useEffect(() => {
    pendingSignalsRef.current = signals;
    if (renderedSignals.length === 0) {
      setRenderedSignals(signals);
      return;
    }

    const sameStructure = signals.length === renderedSignals.length && signals.every((signal, index) => {
      const renderedSignal = renderedSignals[index];
      return renderedSignal && renderedSignal.id === signal.id;
    });

    const hasValueChanges = sameStructure && signals.some((signal, index) => {
      return renderedSignals[index].value !== signal.value;
    });

    if (hasValueChanges) {
      setRenderedSignals(signals);
    }
  }, [signals, renderedSignals]);

  useEffect(() => {
    const node = marqueeContentRef.current;
    if (!node) return;

    const handleIteration = () => {
      const nextSignals = pendingSignalsRef.current;
      const hasChanges = nextSignals.length !== renderedSignals.length || nextSignals.some((nextSignal, index) => {
        const currentSignal = renderedSignals[index];
        return !currentSignal || currentSignal.id !== nextSignal.id || currentSignal.value !== nextSignal.value;
      });

      if (hasChanges) {
        setRenderedSignals(nextSignals);
      }
    };

    node.addEventListener('animationiteration', handleIteration);
    return () => {
      node.removeEventListener('animationiteration', handleIteration);
    };
  }, [renderedSignals]);
  
  return (
    <header
      className={styles.marqueeTopBar}
      aria-label="Status Information"
      data-section={section ?? undefined}
      // The screen's name and the rule under it wear its section's tint (BD10).
      style={section ? ({ '--section-tint': `var(--sc-tint-${section})` } as React.CSSProperties) : undefined}
    >
      <div className={styles.titleSection}>
        <h1 className={styles.screenTitle}>{title}</h1>
      </div>
      
      <div className={styles.marqueeSection}>
        <div ref={marqueeContentRef} className={styles.marqueeContent}>
          {/* First instance of content */}
          {renderedSignals.map((signal) => (
            <React.Fragment key={`first-${signal.id}`}>
              <AnimatedSignalItem signal={signal} />
            </React.Fragment>
          ))}
          {/* Duplicate instance for seamless loop: drawn, not read out a second time */}
          <span aria-hidden="true" style={{ display: 'contents' }}>
            {renderedSignals.map((signal) => (
              <React.Fragment key={`second-${signal.id}`}>
                <AnimatedSignalItem signal={signal} />
              </React.Fragment>
            ))}
          </span>
        </div>
      </div>

      {/* Every readout, including the ones this screen does not carry (decision D-F,
          step 3.4). */}
      <div className={styles.actionSection}>
        {onGlobe && <GlobeTickerExtras onSignals={setEnergySignals} />}
        <button
          type="button"
          className={styles.statusButton}
          onClick={() => showPopup({
            component: SystemStatusPanel as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
            label: 'System status',
            backdrop: true,
          })}
          aria-label="Open system status"
          title="System status"
        >
          <Activity className={styles.buttonIcon} size={14} aria-hidden="true" />
          <span className={styles.buttonLabel}>STATUS</span>
        </button>
      </div>
    </header>
  );
};

export default MainMarqueeTopBar;
