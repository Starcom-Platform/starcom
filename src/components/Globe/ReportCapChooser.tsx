/**
 * How many Intel Reports the globe draws (decisions BA4, BA5): 50, 100, 250,
 * 500, Max (1,000), Unlimited, or a number of one's own from 10. Shown in the
 * "Showing N of M" notice, where a cut is said, and in the Intel Reports
 * settings, to choose before anything is cut. Machines differ, and so do people.
 *
 * Above 200 the app reads more from the relays (BA6), which it says. When this
 * page's share handle has set a cap, that cap holds for the page (BA7), and the
 * chooser says so: what a person chooses here is still kept for next time.
 */
import React, { useState } from 'react';
import { capLabel, isCapRefusal, readReportCap, REPORT_CAP_MAX, REPORT_CAP_MIN, REPORT_CAP_STEPS } from '../../services/intel/reportCap';
import styles from './ReportCapChooser.module.css';

export interface ReportCapChooserProps {
  /** The cap in force: a number, or null for Unlimited. */
  cap: number | null;
  /** Whether the person's setting or this page's share handle set it. */
  from: 'setting' | 'handle';
  onChoose: (cap: number | null) => void;
}

const CHOICES: Array<number | null> = [...REPORT_CAP_STEPS, REPORT_CAP_MAX, null];

export const ReportCapChooser: React.FC<ReportCapChooserProps> = ({ cap, from, onChoose }) => {
  const [own, setOwn] = useState('');
  const [why, setWhy] = useState<string | null>(null);
  const setOwnCap = () => {
    const read = readReportCap(Number(own));
    if (isCapRefusal(read)) {
      setWhy(read.refused);
      return;
    }
    setWhy(null);
    onChoose(read);
  };
  return (
    <div className={styles.chooser} data-testid="report-cap-chooser">
      <div className={styles.steps} role="group" aria-label="How many reports the globe draws">
        {CHOICES.map((choice) => (
          <button
            key={String(choice)}
            type="button"
            className={styles.step}
            aria-pressed={choice === cap}
            onClick={() => onChoose(choice)}
          >
            {capLabel(choice)}
          </button>
        ))}
      </div>
      <div className={styles.own}>
        <input
          type="number"
          min={REPORT_CAP_MIN}
          step={1}
          inputMode="numeric"
          aria-label="A number of your own"
          placeholder="Your own"
          value={own}
          onChange={(e) => setOwn(e.target.value)}
        />
        <button type="button" className={styles.step} onClick={setOwnCap}>Set</button>
      </div>
      {why && <p className={styles.note} role="alert">{why}</p>}
      {!CHOICES.includes(cap) && <p className={styles.note}>Drawing at most {capLabel(cap)}.</p>}
      <p className={styles.note}>A cap of more than 200 reads more from the relays: more data over the network and in memory.</p>
      {from === 'handle' && (
        <p className={styles.note}>Set for this page by the share handle. A choice here is kept for next time.</p>
      )}
    </div>
  );
};

export default ReportCapChooser;
