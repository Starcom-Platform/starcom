import React from 'react';
import { provenanceWords, type Provenance } from '../../services/intel/provenance/provenance';
import { keyLabel } from '../../services/identity/names';
import styles from './ProvenanceFrame.module.css';

/**
 * Whose a record is, drawn one way everywhere (BD3, BD19): MIL-STD-2525's
 * frames, where colour is always backed by shape. Yours is a solid cyan
 * frame, a peer's a dashed one (2525's "assumed friend"); unknown adds a
 * yellow quatrefoil with "?", an impersonation a red diamond. The hover says
 * whose and how that is known, and a screen reader hears it first.
 */
const SAID: Record<Provenance['whose'], string> = {
  own: 'Yours.',
  peer: 'From a peer.',
  unknown: 'Unknown origin.',
  impersonation: 'Impersonation.',
};

const Quatrefoil: React.FC = () => (
  <svg className={styles.mark} viewBox="0 0 16 16" width="14" height="14" data-mark="unknown" aria-hidden="true">
    <g className={styles.unknownFill}>
      <circle cx="8" cy="4.6" r="3.6" />
      <circle cx="8" cy="11.4" r="3.6" />
      <circle cx="4.6" cy="8" r="3.6" />
      <circle cx="11.4" cy="8" r="3.6" />
    </g>
    {/* "?" as a path, Lucide's circle-help geometry (ISC) on this 16-unit grid. */}
    <path d="M6.06 6a2 2 0 0 1 3.89.67c0 1.33-2 2-2 2" className={styles.markStroke} />
    <circle cx="8" cy="11.4" r="0.9" className={styles.markDot} />
  </svg>
);

const Diamond: React.FC = () => (
  <svg className={styles.mark} viewBox="0 0 16 16" width="14" height="14" data-mark="impersonation" aria-hidden="true">
    <path d="M8 0.8 15.2 8 8 15.2 0.8 8Z" className={styles.dangerFill} />
    <path d="M8 4.6v4.2" className={styles.markStroke} />
    <circle cx="8" cy="11.4" r="0.9" className={styles.markDot} />
  </svg>
);

const ProvenanceFrame: React.FC<{
  provenance: Provenance;
  /** A block for a row or a section; inline for a chip. */
  block?: boolean;
  testId?: string;
  children: React.ReactNode;
}> = ({ provenance, block, testId = 'provenance-frame', children }) => {
  const Tag = block ? 'div' : 'span';
  return (
    <Tag
      className={block ? `${styles.frame} ${styles.block}` : styles.frame}
      data-provenance={provenance.whose}
      data-testid={testId}
      title={provenanceWords(provenance, keyLabel)}
    >
      <span className={styles.hidden}>{SAID[provenance.whose]} </span>
      {provenance.whose === 'unknown' && <Quatrefoil />}
      {provenance.whose === 'impersonation' && <Diamond />}
      {children}
    </Tag>
  );
};

export default ProvenanceFrame;
