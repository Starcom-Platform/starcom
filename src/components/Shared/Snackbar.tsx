import React, { useEffect } from 'react';
import { Docked } from '../Dock/Docked';
import styles from './Snackbar.module.css';

interface SnackbarProps {
  message: string;
  open: boolean;
  onClose: () => void;
  duration?: number; // ms
  type?: 'success' | 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

/** The kind in a word, so colour is never the only signal. */
const KIND_WORD = { success: 'Done', info: 'Note', error: 'Failed' } as const;

const Snackbar: React.FC<SnackbarProps> = ({ message, open, onClose, duration = 3000, type = 'info', actionLabel, onAction }) => {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;
  return (
    <Docked slot="snackbar">
      <div
        className={`snackbar snackbar-${type} ${styles.snackbar} ${type === 'info' ? '' : styles[type]}`}
        role="status"
        aria-live="polite"
        data-kind={type}
        tabIndex={0}
      >
        <span className={styles.kind}>{KIND_WORD[type]}</span>
        <span>{message}</span>
        {actionLabel && onAction && (
          <button
            className={styles.action}
            onClick={() => { onAction(); onClose(); }}
            data-testid="snackbar-action"
          >
            {actionLabel}
          </button>
        )}
        <button aria-label="Close" className={styles.close} onClick={onClose} data-testid="snackbar-close">
          ×
        </button>
      </div>
    </Docked>
  );
};

export default Snackbar;
