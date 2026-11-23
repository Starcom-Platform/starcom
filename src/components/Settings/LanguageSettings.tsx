import React, { useId } from 'react';
import { LANGUAGES, languageOf, type LanguageId } from '../../i18n/app/languages';
import { setLanguage, useMessages } from '../../i18n/app/i18n';
import styles from './LanguageSettings.module.css';
import CloudKeySettings from './CloudKeySettings';

/**
 * Settings > Language (decision D-ML, L1): the language of Starcom's screens, each named in itself, kept
 * in this browser. A language not yet checked by a native speaker says so (ML3), and so does a screen
 * not yet translated, which shows in English.
 */
export const LanguageSettings: React.FC = () => {
  const id = useId();
  const { lang, m } = useMessages();
  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`} data-testid="language-settings">
      <h3 id={`${id}-heading`} className={styles.heading}>{m.language.heading}</h3>
      <label className={styles.label}>
        {m.language.choose}
        <select
          className={styles.select}
          value={lang}
          onChange={(e) => { void setLanguage(e.target.value as LanguageId); }}
          data-testid="language-select"
        >
          {LANGUAGES.map((l) => <option key={l.id} value={l.id} lang={l.html}>{l.name}</option>)}
        </select>
      </label>
      {lang !== 'en' && (
        <p className={styles.hint} data-testid="language-status">
          {`${languageOf(lang).reviewed ? m.language.reviewed : m.language.draft} ${m.language.partial}`}
        </p>
      )}
      <CloudKeySettings />
    </section>
  );
};

export default LanguageSettings;
