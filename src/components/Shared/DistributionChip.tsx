import React from 'react';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import styles from './DistributionChip.module.css';
import { useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';

/** What a distribution is chosen for, named in the question and the chip's title. */
export type Distributed = keyof Messages['shared']['distribution']['who'];

/**
 * Who may receive a record, drawn one way everywhere (BD3; decided BD15 on
 * 2026-10-05): Starcom's word in the Traffic Light Protocol's colours on its
 * black chip, with the TLP label and what the choice does in the hover. The
 * word is the one the person chose; the colours follow the standard, so an
 * analyst who knows TLP reads it at a glance.
 *
 * A record nobody decided on reads Undecided, grey and dashed: grey is "not
 * judged", and an undecided record goes nowhere (decision D2). It is not
 * amber, which TLP gives a level Starcom does not have.
 *
 * Before this, distribution was drawn six ways: the raw word in a table cell,
 * outlined chips, a grey chip, a primary-coloured chip, and nothing at all on
 * a report's own page.
 */
const TLP_LABEL: Record<InformationVisibility, string> = {
  public: 'TLP:CLEAR',
  limited: 'TLP:GREEN',
  private: 'TLP:RED',
};

const DistributionChip: React.FC<{
  visibility: InformationVisibility | undefined;
  /** What the record is, for the undecided hover: "this mission", "this report". */
  what?: Distributed;
  testId?: string;
}> = ({ visibility, what = 'it', testId = 'distribution-chip' }) => {
  const { m: { shared: { distribution: t } } } = useMessages();
  return (
  <span
    className={styles.chip}
    data-distribution={visibility ?? 'undecided'}
    data-testid={testId}
    title={visibility
      ? `${TLP_LABEL[visibility]} · ${t.labels[visibility]}`
      : t.nobody[what]}
  >
    <span className={styles.hidden}>{t.named}</span>
    {visibility ? t.words[visibility] : t.undecided}
  </span>
  );
};

export default DistributionChip;
