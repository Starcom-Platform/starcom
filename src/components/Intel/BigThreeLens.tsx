/**
 * The big three on screen (decision D-CT, CT5 and CT6): a small badge on a report that carries a
 * lens, and the filter that shows only reports carrying a chosen one.
 *
 * The filter is All, then TCS, IDC and CBC, any of them together. The choice is kept as the
 * report priority filter is (useLensChoice), so the globe's Intel Reports layer and the Intel
 * Dashboard's list focus on the same lenses.
 *
 * The lens is the publisher's sorting, never a finding: the contract's line says so wherever the
 * filter is offered.
 */
import React from 'react';
import { LENSES, LENS_HELP, lensesOf, toggleLens, type LensId } from '../../services/intel/bigThreeLenses';
import styles from './BigThreeLens.module.css';

/** The lenses a report carries, as small badges with their full names on hover; nothing when it carries none. */
export const LensBadges: React.FC<{ tags?: readonly string[]; lenses?: readonly LensId[]; className?: string }> = ({ tags, lenses, className }) => {
  const ids = lenses ?? lensesOf(tags);
  if (!ids.length) return null;
  return (
    <span className={`${styles.badges}${className ? ` ${className}` : ''}`} data-testid="lens-badges">
      {LENSES.filter((lens) => ids.includes(lens.id)).map((lens) => (
        <span key={lens.id} className={styles.badge} title={`Lens: ${lens.name}. ${LENS_HELP}`} aria-label={`Lens: ${lens.name}`}>
          {lens.short}
        </span>
      ))}
    </span>
  );
};

export interface LensFilterProps {
  chosen: readonly LensId[];
  onChange: (next: LensId[]) => void;
  /** How many reports the choice hides here, when the caller counts them. */
  hidden?: number;
  className?: string;
}

/** All, then the three lenses, any of them together. */
export const LensFilter: React.FC<LensFilterProps> = ({ chosen, onChange, hidden, className }) => (
  <fieldset className={`${styles.filter}${className ? ` ${className}` : ''}`} data-testid="lens-filter">
    <legend className={styles.legend}>Focus on a lens</legend>
    <div className={styles.options}>
      <button
        type="button"
        className={styles.option}
        aria-pressed={chosen.length === 0}
        title="Every report, with a lens or without"
        onClick={() => onChange([])}
      >
        All
      </button>
      {LENSES.map((lens) => (
        <button
          key={lens.id}
          type="button"
          className={styles.option}
          aria-pressed={chosen.includes(lens.id)}
          aria-label={lens.name}
          title={lens.name}
          onClick={() => onChange(toggleLens(chosen, lens.id))}
        >
          {lens.short}
        </button>
      ))}
    </div>
    <p className={styles.help}>
      {chosen.length === 0
        ? 'Shows every report. Choose one or more lenses to show only reports sorted under them.'
        : `Shows only reports sorted under ${LENSES.filter((l) => chosen.includes(l.id)).map((l) => l.name).join(' or ')}.`}
      {hidden !== undefined && hidden > 0 ? ` ${hidden} hidden here.` : ''}
    </p>
    <p className={styles.help}>{LENS_HELP}</p>
  </fieldset>
);
