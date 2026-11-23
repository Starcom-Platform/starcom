/**
 * Asks for the passphrase when something the person did needs their locked key (decision D-KL, KL4): registered as
 * the asker, so a publish, a send or a backup waits on the answer. A wrong passphrase says so and asks again;
 * Cancel leaves the key locked and the action undone, and the action says so. Nothing that runs on its own asks.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@mui/material';
import { WrongPassphraseError, registerUnlockAsker, type UnlockRequest } from '../../services/identity/keyLock';
import styles from './IdentityNoticeRoot.module.css';

interface Pending extends UnlockRequest {
  resolve: (opened: boolean) => void;
}

const KeyUnlockRoot: React.FC = () => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<Pending | null>(null);

  useEffect(() => {
    registerUnlockAsker((request) => new Promise<boolean>((resolve) => {
      // One prompt at a time: an earlier one still open is answered "not opened".
      current.current?.resolve(false);
      current.current = { ...request, resolve };
      setPending(current.current);
      setPassphrase('');
      setError(null);
      setBusy(false);
    }));
    return () => { registerUnlockAsker(null); current.current?.resolve(false); current.current = null; };
  }, []);

  const close = (opened: boolean) => {
    current.current?.resolve(opened);
    current.current = null;
    setPending(null);
    setPassphrase('');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    if (!pending || busy || !passphrase) return;
    setBusy(true);
    setError(null);
    try {
      await pending.attempt(passphrase);
      close(true);
    } catch (e) {
      setBusy(false);
      setError(e instanceof WrongPassphraseError ? e.message : e instanceof Error ? e.message : String(e));
    }
  };

  if (!pending) return null;
  /*
   * An MUI Dialog, so it stacks above any dialog already open and takes the focus. It was a panel portalled into the
   * page, and over a modal (the mission dialog, publishing a Mission Package) that modal's focus trap took every
   * keystroke and its backdrop every click: a person with a locked key could not unlock it there, and could not
   * publish (found by the browser check of the EIN transition audit, 21 Nov 2026). The panel keeps its own look.
   */
  return (
    <Dialog
      open
      onClose={() => close(false)}
      maxWidth={false}
      aria-labelledby="key-unlock-heading"
      slotProps={{ paper: { sx: { background: 'transparent', boxShadow: 'none', m: 2 } } }}
    >
    <aside
      className={`${styles.panel} ${styles.plain}`}
      data-testid="key-unlock"
    >
      <h2 id="key-unlock-heading" className={styles.heading}>Unlock your key</h2>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className={styles.body}>
          Starcom needs your key for {pending.reason}. Enter the passphrase you locked it with.
        </p>
        <label className={styles.label} htmlFor="key-unlock-passphrase">Passphrase</label>
        <input
          id="key-unlock-passphrase"
          className={styles.nameInput}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={passphrase}
          disabled={busy}
          onChange={(e) => { setPassphrase(e.target.value); setError(null); }}
        />
        {error && <p className={styles.warning} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy || !passphrase}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button type="button" className={styles.minor} onClick={() => close(false)}>Cancel</button>
        </div>
        <p className={styles.footnote}>
          It stays unlocked until you close or reload Starcom. Forgot it? Nobody can recover it: bring your key back
          from your backup under Your key.
        </p>
      </form>
    </aside>
    </Dialog>
  );
};

export default KeyUnlockRoot;
