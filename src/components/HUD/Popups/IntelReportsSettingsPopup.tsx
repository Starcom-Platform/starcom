/**
 * The Intel Reports settings (decision BA4): how many reports the globe draws,
 * to choose before anything is cut. The same choice is offered in the "Showing
 * N of M" notice where a cut is said. What a person chooses is kept as their
 * own setting; a cap this page's share handle set holds for the page (BA7), and
 * the chooser says so.
 *
 * And whether each glyph wears its category's emblem (BA14, BA15): on unless
 * the person turns it off, and the handle's choice for its page said beside it.
 *
 * And the big-three lenses to focus on (D-CT, CT5): All, or only the reports
 * sorted under TCS, IDC or CBC. The Intel Dashboard's list keeps the same choice.
 */
import React, { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useCyberCommandSettings } from '../../../hooks/useCyberCommandSettings';
import { effectiveReportCap, getReportCapOverride, subscribeReportCap } from '../../../services/intel/reportCap';
import { emblemsChosen, getReportLookOverride, subscribeReportLook } from '../../../services/intel/reportLook';
import { ReportCapChooser } from '../../Globe/ReportCapChooser';
import { LensFilter } from '../../Intel/BigThreeLens';
import { useLensChoice } from '../../../hooks/useLensChoice';
import styles from './IntelReportsSettingsPopup.module.css';

export interface IntelReportsSettingsPopupProps {
  onClose: () => void;
}

const IntelReportsSettingsPopup: React.FC<IntelReportsSettingsPopupProps> = ({ onClose }) => {
  const { config, updateIntelReports } = useCyberCommandSettings();
  // Re-read when the handle sets or clears this page's cap.
  useSyncExternalStore(subscribeReportCap, getReportCapOverride, getReportCapOverride);
  const { cap, from } = effectiveReportCap(config.intelReports.maxReports);
  // And when the handle sets or clears this page's look.
  const pageLook = useSyncExternalStore(subscribeReportLook, getReportLookOverride, getReportLookOverride);
  const emblems = emblemsChosen(config.intelReports);
  const [lenses, chooseLenses] = useLensChoice();
  return (
    <section className={styles.popup} aria-label="Intel Reports settings">
      <header className={styles.header}>
        <h2 className={styles.title}>Intel Reports</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close Intel Reports settings">
          <X size={16} aria-hidden />
        </button>
      </header>
      <div className={styles.section}>
        <p className={styles.label}>How many reports the globe draws</p>
        <ReportCapChooser cap={cap} from={from} onChoose={(next) => updateIntelReports({ maxReports: next })} />
      </div>
      <div className={styles.section}>
        <LensFilter chosen={lenses} onChange={chooseLenses} />
      </div>
      <div className={styles.section}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={emblems} onChange={(event) => updateIntelReports({ categoryEmblems: event.target.checked })} />
          <span>Category emblems</span>
        </label>
        <p className={styles.note}>
          Each glyph shows what its report is about, its stated category. The colour still says how it was assessed.
        </p>
        {pageLook && (
          <p className={styles.note}>This page's share handle has turned them {pageLook.emblems ? 'on' : 'off'} for this page.</p>
        )}
      </div>
    </section>
  );
};

export default IntelReportsSettingsPopup;
