import React, { useId, useState } from 'react';
import { fill, useMessages } from '../../i18n/app/i18n';
import { keepCloudKey, useCloudKey, type CloudProvider } from '../../services/translation/cloudTranslator';
import { PROVIDER_NAMES } from '../Translation/providerNames';
import styles from './LanguageSettings.module.css';

/**
 * Settings > Language > translation in the cloud, with the person's own key (decision D-ML, T3, ML6,
 * ML17–ML18): Azure or Google, kept in this browser, sent only to the provider chosen, and used only for
 * Public content. Said plainly, with how to keep the key from being any use elsewhere.
 */
export const CloudKeySettings: React.FC = () => {
  const id = useId();
  const { m: { cloudKey: t } } = useMessages();
  const kept = useCloudKey();
  const [provider, setProvider] = useState<CloudProvider>(kept?.provider ?? 'azure');
  const [key, setKey] = useState('');
  const [region, setRegion] = useState(kept?.region ?? '');
  return (
    <div className={styles.cloud} aria-labelledby={`${id}-cloud`} data-testid="cloud-key-settings">
      <h4 id={`${id}-cloud`} className={styles.subheading}>{t.heading}</h4>
      <p className={styles.hint}>{t.note}</p>
      {kept ? (
        <>
          <p className={styles.hint} data-testid="cloud-key-kept">{fill(t.kept, { provider: PROVIDER_NAMES[kept.provider] })}</p>
          <p className={styles.hint}>{t[kept.provider]}</p>
          <button type="button" className={styles.button} onClick={() => keepCloudKey(null)}>{t.remove}</button>
        </>
      ) : (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (key.trim()) { keepCloudKey({ provider, key, region }); setKey(''); } }}>
          <p className={styles.hint}>{t.none}</p>
          <label className={styles.label}>
            {t.provider}
            <select className={styles.select} value={provider} onChange={(e) => setProvider(e.target.value as CloudProvider)} data-testid="cloud-provider">
              {(['azure', 'google'] as const).map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
            </select>
          </label>
          <p className={styles.hint}>{t[provider]}</p>
          <label className={styles.label}>
            {t.key}
            <input className={styles.select} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} data-testid="cloud-key" />
          </label>
          {provider === 'azure' && (
            <label className={styles.label}>
              {t.region}
              <input className={styles.select} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="westeurope" data-testid="cloud-region" />
            </label>
          )}
          <button type="submit" className={styles.button} disabled={!key.trim()}>{t.keep}</button>
        </form>
      )}
    </div>
  );
};

export default CloudKeySettings;
