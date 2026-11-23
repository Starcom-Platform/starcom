import React from 'react';
import styles from './SupportEntryButton.module.css';
import { Glyph } from '../../symbols/Glyph';

interface SupportEntryButtonProps {
  onOpen: () => void;
}

const SupportEntryButton: React.FC<SupportEntryButtonProps> = ({ onOpen }) => {
  return (
    <button
      type="button"
      className={styles.supportButton}
      onClick={onOpen}
      aria-label="Support the mission"
    >
      <span className={styles.icon}>
        <Glyph name="action:support" size={14} />
      </span>
      <span className={styles.label}>Support Ops</span>
    </button>
  );
};

export default SupportEntryButton;
