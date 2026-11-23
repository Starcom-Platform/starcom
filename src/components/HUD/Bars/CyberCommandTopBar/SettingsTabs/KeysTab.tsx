// KeysTab.tsx
// API keys of the person's own, for the feeds and tools that read one.
import React, { useEffect, useReducer, useState } from 'react';
import {
  setUserCredential,
  clearUserCredential,
  resolveCredential,
  CREDENTIALS_CHANGED_EVENT,
} from '../../../../../shared/config/userCredentialStore';
import { specializationsUsing } from '../../../../../applications/netrunner/execution/toolsForSpecialization';
import styles from './KeysTab.module.css';

/**
 * Starcom runs no server, so a key either belongs to the person using the app or
 * does not belong in the client (see userCredentialStore). This is where one is
 * entered. It was ProviderConfigurationPanel on the /osint page, and it went with
 * that page in 14432bae, which left every feed and tool that reads a key with no
 * way to obtain one.
 *
 * Offered: each provider whose key something in the app uses. A test holds this
 * list to the keys the source reads, less those read only by code nothing runs.
 * Not brought back from the old panel: an "Enable Real APIs" switch whose state
 * was never saved, a "Test Connection" button that only logged, and status badges
 * from a service that reported Shodan as having a key whether or not it did.
 */
export interface KeyProvider {
  id: string;
  name: string;
  /** What in the app uses the key, in words a person recognises. */
  usedBy: string;
  getKeyUrl: string;
  placeholder: string;
}

export const KEY_PROVIDERS: KeyProvider[] = [
  {
    id: 'eia',
    name: 'EIA',
    usedBy: 'Energy figures in the marquee along the top of the globe, and the Resource Zones layer',
    getKeyUrl: 'https://www.eia.gov/opendata/register.php',
    placeholder: 'EIA API key',
  },
  {
    id: 'shodan',
    name: 'Shodan',
    usedBy: `NetRunner missions by ${specializationsUsing('Shodan').join(', ')} bots`,
    getKeyUrl: 'https://account.shodan.io/',
    placeholder: 'Shodan API key',
  },
];

const KeyRow: React.FC<{ provider: KeyProvider }> = ({ provider }) => {
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState<{ text: string; refused?: boolean } | null>(null);
  const hasOwnKey = resolveCredential(provider.id).source === 'user';

  const save = () => {
    const value = draft.trim();
    if (!value) return;
    if (setUserCredential(provider.id, value)) {
      setDraft('');
      setShown(false);
      setNote({ text: 'Saved in this browser. Starcom never receives it.' });
    } else {
      setNote({ text: 'Not saved: this kind of credential cannot be held safely in a browser.', refused: true });
    }
  };

  const remove = () => {
    clearUserCredential(provider.id);
    setNote({ text: 'Removed from this browser.' });
  };

  return (
    <section className={styles.provider} role="group" aria-label={provider.name}>
      <div className={styles.providerHeader}>
        <h4 className={styles.providerName}>{provider.name}</h4>
        <span className={`${styles.status} ${hasOwnKey ? styles.statusSet : styles.statusNone}`}>
          {hasOwnKey ? 'Your key is set' : 'No key set'}
        </span>
      </div>
      <p className={styles.usedBy}>Used by: {provider.usedBy}</p>
      <div className={styles.controls}>
        <input
          className={styles.input}
          type={shown ? 'text' : 'password'}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setNote(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder={hasOwnKey ? 'Key set. Type a new one to replace it' : provider.placeholder}
          aria-label={`${provider.name} key`}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={styles.button}
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          disabled={!draft}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={save} disabled={!draft.trim()}>
          Save key
        </button>
        {hasOwnKey && (
          <button type="button" className={`${styles.button} ${styles.danger}`} onClick={remove}>
            Remove key
          </button>
        )}
      </div>
      <div className={styles.footer}>
        <a className={styles.getKey} href={provider.getKeyUrl} target="_blank" rel="noopener noreferrer">
          Get a key from {provider.name}
        </a>
        {note && <span className={note.refused ? styles.refused : styles.note} role="status">{note.text}</span>}
      </div>
    </section>
  );
};

const KeysTab: React.FC = () => {
  // Saving or removing a key announces it, so each row reads the store afresh.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(CREDENTIALS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CREDENTIALS_CHANGED_EVENT, refresh);
  }, []);

  return (
    <div className={styles.keysTab}>
      <p className={styles.intro}>
        Some feeds and tools need an API key of your own. It is kept in this browser. A feed or tool
        without one says so, and never shows anything made up.
      </p>
      {KEY_PROVIDERS.map((provider) => <KeyRow key={provider.id} provider={provider} />)}
    </div>
  );
};

export default KeysTab;
