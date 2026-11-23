/**
 * Years held back for Mecha Jono's sealed tests (decision D-PW, PW75), drawn over a lane: a shaded band where its data
 * would be, saying which years, until each is released.
 */
import React from 'react';
import type { Withheld } from '../../../services/psiWatch/timestream/withheld';
import { fractionAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

/** The held-back years a moment falls in, or null. */
export const heldAt = (held: readonly Withheld[], ms: number): string | null => held.find((h) => ms >= h.fromMs && ms < h.untilMs)?.years ?? null;

/** A band shows its words where it is wide enough for them. */
const WORDS_PX = 110;

export const HeldBand: React.FC<{ held: readonly Withheld[]; view: TimeView; width: number; height: number; words: (years: string) => string }> = ({ held, view, width, height, words }) => (
  <>
    {held.map((h) => {
      const x0 = Math.max(0, fractionAt(view, h.fromMs) * width);
      const x1 = Math.min(width, fractionAt(view, h.untilMs) * width);
      if (x1 <= x0) return null;
      return (
        <div key={h.years} className={styles.heldBand} style={{ left: x0, width: x1 - x0, height }} data-testid="psi-timestream-held" aria-hidden="true">
          {x1 - x0 >= WORDS_PX ? words(h.years) : null}
        </div>
      );
    })}
  </>
);
