import React from 'react';
import styles from './SourceStatus.module.css';

/**
 * One way to say how a source stands (plan item 8.3c): a source of data or
 * imagery, what it answered, and in a word, a glyph and a colour that mean the
 * same thing wherever they appear. The colours are the tokens' (tokens.ts):
 * green ready, red failed, amber paused, grey for what is not judged yet.
 * Colour is never the only signal; the word is always there.
 */
export type SourceState = 'waiting' | 'loading' | 'ready' | 'failed' | 'timeout' | 'paused' | 'snapshot';

export interface SourceStatus {
  id: string;
  label: string;
  state: SourceState;
  /** What else is known: the time it took, a reason, its age. */
  detail?: string;
}

const WORD: Record<SourceState, string> = {
  waiting: 'waiting',
  loading: 'loading',
  ready: 'ready',
  failed: 'failed',
  timeout: 'timed out',
  paused: 'paused',
  snapshot: 'snapshot',
};

const GLYPH: Record<SourceState, string> = {
  waiting: '○',
  loading: '◌',
  ready: '●',
  failed: '✕',
  timeout: '✕',
  paused: '‖',
  snapshot: '◆',
};

/** A list of sources, each on its own line. */
export const SourceStatusList: React.FC<{ sources: SourceStatus[]; label: string }> = ({ sources, label }) => (
  <ul className={styles.list} aria-label={label}>
    {sources.map((s) => (
      <li key={s.id} className={styles.line} data-state={s.state} data-testid={`source-${s.id}`}>
        <span className={styles.glyph} aria-hidden="true">{GLYPH[s.state]}</span>
        {s.label}: {WORD[s.state]}{s.detail ? ` · ${s.detail}` : ''}
      </li>
    ))}
  </ul>
);

/** One source's standing as a badge, where a section names its source already. */
export const SourceStatusBadge: React.FC<{ state: SourceState; text: string; title?: string }> = ({ state, text, title }) => (
  <span className={styles.badge} data-state={state} title={title}>
    <span className={styles.glyph} aria-hidden="true">{GLYPH[state]}</span>
    {text}
  </span>
);
