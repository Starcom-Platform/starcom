import React, { useEffect, useState } from 'react';
import { Docked } from '../Dock/Docked';
import { nip19 } from 'nostr-tools';
import {
  pendingIdentityNotice, acknowledgeIdentityNotice, subscribeIdentityNotice, recordKeyBackedUp, keyMayExistOnlyHere,
  type IdentityNotice,
} from '../../services/identity/identityNotice';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { passphraseProblem, subscribeKeyLock } from '../../services/identity/keyLock';
import { useModalOpen } from '../../hooks/useModalOpen';
import styles from './IdentityNoticeRoot.module.css';

/**
 * Tells the person, once, that this browser now holds a key that can sign as them.
 *
 * ─── WHY A SURFACE AND NOT A LOG LINE ──────────────────────────────────────
 *
 * Until now the app minted a secp256k1 secret key on load, into plain-text
 * localStorage, and never mentioned it. That key is what chat signs with, so it was
 * already on public relays under a pubkey its owner had never seen. A key is now
 * created only when something needs a signature — and a creation nobody is told
 * about is the same defect with better timing, so this says so where a person is
 * actually looking.
 *
 * It informs rather than interrupts: no backdrop, nothing blocked. What it offers is
 * what a person can reasonably want at that moment — the key itself to keep, the
 * better arrangement (an extension holding it instead), and deletion.
 *
 * ─── AFTER THE TASK, NOT OVER IT ───────────────────────────────────────────
 *
 * Saving a first case or mission is what usually mints the key, so the panel used to
 * open while that dialog was still up, with "Delete it" as one of its three buttons.
 * It now waits while any modal dialog is open (aria-modal: MUI's dialogs and the
 * shared Modal set it), and deleting sits apart from the first row.
 */
/** The public key in the form other Nostr apps and relay registration ask for. */
const toNpub = (pubkey: string): string | null => {
  try { return nip19.npubEncode(pubkey); } catch { return null; }
};

const IdentityNoticeRoot: React.FC = () => {
  const [notice, setNotice] = useState<IdentityNotice | null>(() => pendingIdentityNotice());
  const [nsec, setNsec] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState<'npub' | 'nsec' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockState, setLockState] = useState(() => nostrIdentityService.keyLockState());
  // The passphrase lock is offered selected (D-KL, KL2): unticked, or "Got it", skips it.
  const [wantLock, setWantLock] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const modalOpen = useModalOpen(notice !== null);

  useEffect(() => subscribeIdentityNotice(setNotice), []);
  useEffect(() => subscribeKeyLock(() => setLockState(nostrIdentityService.keyLockState())), []);

  if (!notice || modalOpen) return null;

  const pubkey = nostrIdentityService.getPubkey();
  const npub = pubkey ? toNpub(pubkey) : null;
  // The key sits in this page unencrypted: the case a lock is for.
  const lockable = lockState === 'none' && pubkey !== null && nostrIdentityService.heldByUplink() === null;

  const dismiss = () => {
    setNsec(null);
    setConfirmingDelete(false);
    setPassphrase('');
    setAgain('');
    acknowledgeIdentityNotice();
  };

  const reveal = async () => {
    setError(null);
    try {
      // A key locked since the notice first showed asks for its passphrase (D-KL).
      setNsec(await nostrIdentityService.exportNsecUnlocking());
      // Shown to be kept: the publish review stops prompting for a backup.
      recordKeyBackedUp();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The key could not be read.');
    }
  };

  const lockIt = async () => {
    const problem = passphraseProblem(passphrase);
    if (problem) { setLockError(problem); return; }
    if (passphrase !== again) { setLockError('The two passphrases differ.'); return; }
    setLocking(true);
    setLockError(null);
    try {
      await nostrIdentityService.lockKey(passphrase);
      dismiss();
    } catch (e) {
      setLockError(`Not locked: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLocking(false);
    }
  };

  // Best effort: a browser may refuse clipboard access, and the key is on screen to
  // be written down either way — so a refusal is not an error worth shouting about.
  const copy = (which: 'npub' | 'nsec', text: string | null) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => setCopied(which)).catch(() => setCopied(null));
  };

  const del = () => {
    nostrIdentityService.forgetIdentity();
    setNsec(null);
    setConfirmingDelete(false);
  };

  /*
   * In the bottom-right dock (K16), which portals it out of the app tree as the
   * portal to <body> did: mounted in the tree, this panel came out 0x0 at the
   * top-left corner in the built app, since an ancestor with a transform becomes the
   * containing block for a position:fixed descendant. Fixed at the screen's corner,
   * it sat over Support Ops, the globe's layer count and its key.
   */
  return (
    <Docked slot="identityNotice">
    <aside className={styles.panel} role="status" aria-label="New signing identity" data-testid="identity-notice">
      <h2 className={styles.heading}>This browser made you a signing key</h2>
      <p className={styles.body}>
        It was created {notice.imported ? 'from the key you imported' : 'because of ' + notice.reason}.
        Everything you publish from here — chat messages, reports — is signed with it, and
        it is stored {lockState === 'none'
          ? <strong>unencrypted in this browser only</strong>
          : <strong>in this browser only, locked with your passphrase</strong>}. Clear your browser
        data and it is gone; copy it out and you can be the same person elsewhere.
      </p>
      {/* D-CS (12 Nov): the key can live outside the page, where no script here can read it. */}
      <p className={styles.body} data-testid="identity-notice-extension">
        To keep it out of this page, use a signing extension (NIP-07) or Starcom Uplink. Starcom signs
        through either when installed. Import this key there to stay the same person, then delete it here.
      </p>
      {npub && (
        <div className={styles.pubkey}>
          <span className={styles.label}>You are</span>
          <code data-testid="identity-notice-pubkey" title={npub}>{npub.slice(0, 14)}…{npub.slice(-6)}</code>
          <button type="button" className={styles.minor} onClick={() => copy('npub', npub)}>
            {copied === 'npub' ? 'Copied' : 'Copy public key (npub)'}
          </button>
        </div>
      )}

      {nsec && (
        <div className={styles.secret}>
          <p className={styles.warning}>
            Anyone who has this can sign as you. It is not a password and cannot be reset.
          </p>
          <code className={styles.nsec} data-testid="identity-notice-nsec">{nsec}</code>
          <div className={styles.secretActions}>
            <button
              type="button"
              className={styles.minor}
              aria-label="Copy SECRET key — never share"
              onClick={() => copy('nsec', nsec)}
            >
              {copied === 'nsec' ? 'Copied' : 'Copy SECRET key — never share'}
            </button>
            <button type="button" className={styles.minor} onClick={() => setNsec(null)}>Hide</button>
          </div>
        </div>
      )}

      {error && <p className={styles.warning} role="alert">{error}</p>}

      {confirmingDelete ? (
        <div className={styles.confirm} data-testid="identity-notice-confirm">
          <p className={styles.warning}>
            Delete this key? Without a copy it cannot be recovered. What it already signed
            stays published; deleting the key does not unpublish it.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={del}>Delete it</button>
            <button type="button" className={styles.minor} onClick={() => setConfirmingDelete(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={dismiss}>Got it</button>
          {!nsec && (
            <button type="button" className={styles.minor} onClick={() => void reveal()} data-testid="identity-notice-reveal">
              Show the key to back up
            </button>
          )}
        </div>
      )}

      {/* D-KL, KL2: offered selected, after the backup. "Got it", or unticking, skips it. */}
      {lockable && !confirmingDelete && (
        <form
          className={styles.secret}
          data-testid="identity-notice-lock"
          onSubmit={(e) => { e.preventDefault(); void lockIt(); }}
        >
          <label className={`${styles.body} ${styles.agentRow}`}>
            <input type="checkbox" checked={wantLock} onChange={(e) => { setWantLock(e.target.checked); setLockError(null); }} />
            <span>Lock this key with a passphrase</span>
          </label>
          {wantLock && (
            <>
              <p className={styles.warning}>
                Then someone who copies this browser&apos;s data, or uses this computer, cannot sign as you.
                If you forget the passphrase, nobody can recover the key, Starcom included.
                {keyMayExistOnlyHere() && ' Back the key up first: "Show the key to back up", above.'}
              </p>
              <label className={styles.label} htmlFor="identity-notice-passphrase">Passphrase, at least 10 characters</label>
              <input
                id="identity-notice-passphrase"
                className={styles.nameInput}
                type="password"
                autoComplete="new-password"
                value={passphrase}
                disabled={locking}
                onChange={(e) => { setPassphrase(e.target.value); setLockError(null); }}
              />
              <label className={styles.label} htmlFor="identity-notice-passphrase-again">Type it again</label>
              <input
                id="identity-notice-passphrase-again"
                className={styles.nameInput}
                type="password"
                autoComplete="new-password"
                value={again}
                disabled={locking}
                onChange={(e) => { setAgain(e.target.value); setLockError(null); }}
              />
              {lockError && <p className={styles.warning} role="alert">{lockError}</p>}
              <div className={styles.actions}>
                <button type="submit" className={styles.minor} disabled={locking || !passphrase || !again}>
                  {locking ? 'Locking…' : 'Lock it'}
                </button>
              </div>
              <p className={styles.footnote}>Starcom then asks for it once each visit, the first time it needs your key.</p>
            </>
          )}
        </form>
      )}

      <p className={styles.footnote}>
        A Nostr signer extension is better: it holds the key where this app cannot read it.
        This app uses one when it is installed.
        {nostrIdentityService.hasExtension() && ' One is installed — reload and it will be used.'}
      </p>

      {!confirmingDelete && (
        <div className={styles.deleteRow}>
          <button type="button" className={styles.quiet} onClick={() => setConfirmingDelete(true)}>
            Delete this key…
          </button>
        </div>
      )}
    </aside>
    </Docked>
  );
};

export default IdentityNoticeRoot;
