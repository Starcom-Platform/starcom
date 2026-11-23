import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { publishedCallsign, setPublishedCallsign, publishesAsAgent, setPublishesAsAgent } from '../../services/identity/callsign';
import { onCallsignPromptOpened } from './callsignPrompt';
import styles from './IdentityNoticeRoot.module.css';

/**
 * Sets the callsign you publish under (decision D-MX, MX7): what a Mission
 * Package you sign names as its author. Opened on request only, from "/callsign"
 * or your key's panel: it is published, so it is chosen, never prompted for.
 * The display name (OwnNameRoot) is a different thing and stays private.
 *
 * Beside it, whether this key is an agent's (MX14): what it signs then says
 * so. That is disclosure, and limits nothing.
 */
const CallsignRoot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [agent, setAgent] = useState(false);

  useEffect(() => {
    const show = () => { setDraft(publishedCallsign() ?? ''); setAgent(publishesAsAgent()); setProblem(null); setOpen(true); };
    return onCallsignPromptOpened(show);
  }, []);

  if (!open) return null;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setPublishedCallsign(draft);
      setPublishesAsAgent(agent);
      setOpen(false);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  // Through a portal to <body>, as the name prompt is.
  return createPortal((
    <aside className={`${styles.panel} ${styles.plain}`} role="dialog" aria-labelledby="callsign-heading" data-testid="callsign-prompt">
      <h2 id="callsign-heading" className={styles.heading}>Your callsign</h2>
      <p className={styles.body}>
        Published as the author of what you sign. Choose a callsign, never your legal name.
      </p>
      <p className={styles.body}>Leave it empty to publish under your key.</p>
      <form onSubmit={save}>
        <label className={styles.label} htmlFor="callsign-input">Callsign</label>
        <input
          id="callsign-input"
          className={styles.nameInput}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setProblem(null); }}
          maxLength={40}
          autoComplete="off"
          aria-describedby={problem ? 'callsign-problem' : undefined}
          autoFocus
        />
        {problem && <p id="callsign-problem" className={styles.body} role="alert">{problem}</p>}
        <label className={`${styles.body} ${styles.agentRow}`}>
          <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} />
          <span>This key is an agent&apos;s. What it signs says so; that limits nothing.</span>
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>Save</button>
          <button type="button" className={styles.minor} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </aside>
  ), document.body);
};

export default CallsignRoot;
