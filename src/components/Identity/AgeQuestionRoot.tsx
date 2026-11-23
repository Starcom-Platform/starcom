/**
 * Asks "How old are you?" the first time Starcom would make a key (decision D-RS, RS39), for whatever needs one:
 * registered as the asker, so the publish review, or a key made for chat, waits on the answer. Under 13, it says
 * plainly that Starcom makes no key, so nothing is posted. "Not now" sends nothing.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UNDER_13_REFUSAL, registerAgeAsker, type AgeAnswer } from '../../services/identity/ageAnswer';
import AgeQuestion from './AgeQuestion';
import styles from './IdentityNoticeRoot.module.css';

const AgeQuestionRoot: React.FC = () => {
  const [state, setState] = useState<'closed' | 'asking' | 'refused'>('closed');
  const pending = useRef<((answer: AgeAnswer | null) => void) | null>(null);

  useEffect(() => {
    registerAgeAsker(() => new Promise<AgeAnswer | null>((resolve) => {
      pending.current?.(null);
      pending.current = resolve;
      setState('asking');
    }));
    return () => { registerAgeAsker(null); pending.current?.(null); pending.current = null; };
  }, []);

  const answer = (given: AgeAnswer | null) => {
    pending.current?.(given);
    pending.current = null;
    setState(given?.bracket === 'under_13' ? 'refused' : 'closed');
  };

  if (state === 'closed') return null;
  return createPortal((
    <aside className={`${styles.panel} ${styles.plain}`} role="dialog" aria-labelledby="age-root-heading" data-testid="age-question-root">
      <h2 id="age-root-heading" className={styles.heading}>Before Starcom makes your key</h2>
      {state === 'asking' && <AgeQuestion onAnswer={answer} onDismiss={() => answer(null)} />}
      {state === 'refused' && (
        <>
          <p className={styles.body}>{UNDER_13_REFUSAL}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setState('closed')}>Close</button>
          </div>
        </>
      )}
    </aside>
  ), document.body);
};

export default AgeQuestionRoot;
