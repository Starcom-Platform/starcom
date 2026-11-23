import React from 'react';
import { glossaryEntry } from '../../services/help/glossary';
import { openGlossary } from './glossaryOpen';
import styles from './WhatIs.module.css';

/**
 * A "?" beside a word that opens the glossary at it (plan item 3.2). The
 * word's one-line meaning is its hover, so a glance is enough, and the rest
 * is one click away. A term the glossary lacks renders nothing, and a test
 * fails on it.
 */
const WhatIs: React.FC<{ term: string }> = ({ term }) => {
  const entry = glossaryEntry(term);
  if (!entry) return null;
  return (
    <button
      type="button"
      className={styles.whatIs}
      title={entry.short}
      aria-label={`What is "${entry.term}"? (glossary)`}
      onClick={(event) => { event.stopPropagation(); event.preventDefault(); openGlossary(entry.id); }}
      data-testid={`what-is-${entry.id}`}
    >
      ?
    </button>
  );
};

export default WhatIs;
