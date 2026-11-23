import React, { useEffect, useId, useState } from 'react';
import type { ApplicationId, Destination } from '../Router/EnhancedApplicationRouter';
import styles from './PhoneBottomBar.module.css';
import { PHONE_BAR, type PhoneBarEntry } from './phoneBar';
import { Glyph } from '../../symbols/Glyph';
import JobRail from './JobRail';
import { useJobCount } from '../../hooks/useJobCount';
import type { SectionId } from '../../styles/tokens';
import { openMainSettings } from '../Settings/settingsEvents';
import { useDestinations } from '../Router/useDestinations';
import { useMessages } from '../../i18n/app/i18n';

/** A button's marker wears its section's tint (BD10); a sheet's button, its open app's. */
const tint = (section: SectionId) => ({ '--section-tint': `var(--sc-tint-${section})` } as React.CSSProperties);

export interface PhoneBottomBarProps {
  isActive: (d: Destination) => boolean;
  onNavigate: (d: Destination) => void;
  supportEnabled: boolean;
  onSupport: () => void;
}

/** The bar on a phone (K2, BD5); phoneBar.ts says what is on it, and why. */
export const PhoneBottomBar: React.FC<PhoneBottomBarProps> = ({ isActive, onNavigate, supportEnabled, onSupport }) => {
  const [open, setOpen] = useState<'intel' | 'more' | null>(null);
  const jobCount = useJobCount();
  const { m: { nav } } = useMessages();
  const destinations = useDestinations();
  const destination = (app: ApplicationId): Destination => destinations.find((d) => d.app === app)!;
  /** A bar entry's own name: Intel and More are the bar's words, not an application's. */
  const entryLabel = (entry: { key: string; label: string }) => (entry.key === 'intel' ? nav.intel : entry.key === 'more' ? nav.more : entry.label);
  const sheetId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (d: Destination) => { setOpen(null); onNavigate(d); };
  const sheet = PHONE_BAR.find((e): e is Extract<PhoneBarEntry, { apps: readonly ApplicationId[] }> => 'apps' in e && e.key === open);

  return (
    <div className={styles.phoneBar} data-testid="phone-bar">
      {sheet && (
        <div className={styles.sheet} id={sheetId} role="group" aria-label={entryLabel(sheet)} data-testid={`phone-sheet-${sheet.key}`}>
          {/* The running jobs, at the top of More (BD14). */}
          {sheet.key === 'more' && <JobRail className={styles.sheetJobs} />}
          {sheet.apps.map(destination).map((d) => (
            <button key={d.key} type="button" className={styles.sheetItem} data-app={d.app} data-sfx="switch"
              aria-current={isActive(d) ? 'page' : undefined} onClick={() => go(d)}>
              <span className={styles.sheetIcon}><Glyph name={d.glyph} size={20} /></span>
              <span className={styles.sheetText}>
                <span className={styles.sheetName}>{d.label}</span>
                <span className={styles.sheetDescription}>{d.description}</span>
              </span>
            </button>
          ))}
          {sheet.key === 'more' && supportEnabled && (
            <button type="button" className={styles.sheetItem} onClick={() => { setOpen(null); onSupport(); }}>
              <span className={styles.sheetIcon}><Glyph name="action:support" size={20} /></span>
              <span className={styles.sheetText}>
                <span className={styles.sheetName}>{nav.supportOps}</span>
                <span className={styles.sheetDescription}>{nav.supportMeans}</span>
              </span>
            </button>
          )}
          {/* The app's settings: the header has no room for their button on a phone. */}
          {sheet.key === 'more' && (
            <button type="button" className={styles.sheetItem} aria-haspopup="dialog"
              onClick={() => { setOpen(null); openMainSettings(); }}>
              <span className={styles.sheetIcon}><Glyph name="action:settings" size={20} /></span>
              <span className={styles.sheetText}>
                <span className={styles.sheetName}>{nav.settings}</span>
                <span className={styles.sheetDescription}>{nav.settingsMeans}</span>
              </span>
            </button>
          )}
        </div>
      )}
      {PHONE_BAR.map((entry) => {
        if ('app' in entry) {
          const d = destination(entry.app);
          return (
            <button key={entry.key} type="button" className={styles.button} aria-label={d.label} data-sfx="switch"
              aria-current={isActive(d) ? 'page' : undefined} onClick={() => go(d)} style={tint(d.section)}>
              <span className={styles.icon}><Glyph name={d.glyph} /></span>
              <span className={styles.label}>{d.label}</span>
            </button>
          );
        }
        const held = entry.apps.map(destination);
        const openOne = held.find((d) => isActive(d));
        const holdsOpenApp = Boolean(openOne);
        return (
          <button key={entry.key} type="button" className={styles.button} aria-label={entryLabel(entry)}
            aria-expanded={open === entry.key} aria-controls={open === entry.key ? sheetId : undefined}
            aria-current={holdsOpenApp ? 'page' : undefined}
            style={tint((openOne ?? held[0]).section)}
            onClick={() => setOpen((was) => (was === entry.key ? null : entry.key))}>
            <span className={styles.icon}><Glyph name={entry.glyph} /></span>
            {entry.key === 'more' && jobCount > 0 && <span className={styles.count} data-testid="job-count">{jobCount}</span>}
            <span className={styles.label}>{entryLabel(entry)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default PhoneBottomBar;
