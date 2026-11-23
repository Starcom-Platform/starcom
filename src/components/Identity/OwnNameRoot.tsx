import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { subscribeIdentityNotice, pendingIdentityNotice } from '../../services/identity/identityNotice';
import { ownName, setOwnName } from '../../services/identity/names';
import { useModalOpen } from '../../hooks/useModalOpen';
import styles from './IdentityNoticeRoot.module.css';

/**
 * Asks what to call you (plan item 2.1, story S2: "There is no screen to set a
 * display name").
 *
 * Asked once there is a key for the name to stand for: before that nothing on
 * any screen is yours, and a prompt over a first look at the globe would ask
 * for something that has no use yet. It waits for the key notice, which comes
 * first because it says what the key is, and for any open dialog. It is asked
 * once; "/name" in the header's command box opens it again to change the name.
 */
const ASKED_KEY = 'starcom.names.asked';

const alreadyAsked = (): boolean => {
  try { return globalThis.localStorage?.getItem(ASKED_KEY) !== null; } catch { return false; }
};
const markAsked = (): void => {
  try { globalThis.localStorage?.setItem(ASKED_KEY, new Date().toISOString()); } catch { /* asked again next time */ }
};

const openers = new Set<() => void>();

/** Opens the card on request, to set or change your name. */
export function openOwnNamePrompt(): void {
  openers.forEach((open) => open());
}

/** Whether this browser has a key a name could stand for, and the key notice has been read. */
function useReadyToAsk(): boolean {
  const check = () => nostrIdentityService.signerPubkey() !== null && pendingIdentityNotice() === null;
  const [ready, setReady] = useState(check);
  useEffect(() => {
    const update = () => setReady(check());
    const stopNotice = subscribeIdentityNotice(update);
    const stopSigner = nostrIdentityService.subscribeSigner(update);
    return () => { stopNotice(); stopSigner(); };
  }, []);
  return ready;
}

const OwnNameRoot: React.FC = () => {
  const ready = useReadyToAsk();
  const [asked, setAsked] = useState(() => alreadyAsked() || ownName() !== null);
  const [requested, setRequested] = useState(false);
  const [draft, setDraft] = useState(() => ownName() ?? '');
  const showing = requested || (ready && !asked);
  const overDialog = useModalOpen(showing);

  useEffect(() => {
    const open = () => { setDraft(ownName() ?? ''); setRequested(true); };
    openers.add(open);
    return () => { openers.delete(open); };
  }, []);

  if (!showing || (overDialog && !requested)) return null;

  const close = () => {
    markAsked();
    setAsked(true);
    setRequested(false);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setOwnName(draft);
    close();
  };

  // Through a portal to <body>, for the reason IdentityNoticeRoot gives.
  return createPortal((
    <aside className={`${styles.panel} ${styles.plain}`} role="dialog" aria-labelledby="own-name-heading" data-testid="own-name-prompt">
      <h2 id="own-name-heading" className={styles.heading}>What should Starcom call you?</h2>
      <p className={styles.body}>
        Your name shows in place of your key, to you, in this browser. It is never
        published: not in a package, not in a finding, not as a profile.
      </p>
      <form onSubmit={save}>
        <label className={styles.label} htmlFor="own-name-input">Your name</label>
        <input
          id="own-name-input"
          className={styles.nameInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={60}
          autoComplete="name"
          autoFocus
        />
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>Save</button>
          <button type="button" className={styles.minor} onClick={close}>Not now</button>
        </div>
      </form>
    </aside>
  ), document.body);
};

export default OwnNameRoot;
