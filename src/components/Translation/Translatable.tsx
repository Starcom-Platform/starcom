import React, { useEffect, useState } from 'react';
import { fill, useMessages } from '../../i18n/app/i18n';
import { languageOf } from '../../i18n/app/languages';
import { browserTranslates, detected, packState, translateHere, translatorTag } from '../../services/translation/browserTranslator';
import { seemsWrittenIn } from '../../services/translation/writtenIn';
import { modelKept, modelTranslates, translateWithModel, type ModelProgress } from '../../services/translation/nllbTranslator';
import { cloudKey, translateInCloud, type CloudProvider } from '../../services/translation/cloudTranslator';
import { PROVIDER_NAMES } from './providerNames';
import styles from './Translatable.module.css';

/**
 * "Translate" beneath words someone wrote (decision D-ML, T1, T2): a report from abroad read in the language
 * Starcom shows, on this device: by the browser's own translator where it has the language, else by
 * Starcom's own, NLLB-200 (ML15), fetched once at the person's choice. Only where the words seem to be in
 * another language.
 *
 * The rules the record sets: the original stays where it was, above; the translation is marked as the
 * machine's, with the engine and the language it was read as; and nothing leaves the device. A language
 * pack is fetched by the browser only at the person's click.
 */

/** Languages a person may say the words are in, when neither the browser nor the words say. */
const CHOICES = ['en', 'de', 'pt', 'es', 'fr', 'it', 'nl', 'pl', 'uk', 'ru', 'tr', 'ar', 'fa', 'hi', 'bn', 'ur', 'zh', 'ja', 'ko', 'vi', 'id', 'sw'] as const;

type Step =
  | { at: 'idle' }
  | { at: 'choosing'; source: string }
  | { at: 'fetching'; source: string; share: number }
  | { at: 'translating' }
  | { at: 'offer'; source: string; why: string; model: boolean; cloud: CloudProvider | null }
  | { at: 'model'; source: string; progress: ModelProgress }
  | { at: 'cloud'; provider: CloudProvider }
  | { at: 'done'; source: string; words: string; by: 'browser' | 'model' | CloudProvider }
  | { at: 'said'; words: string };

/** Whether this browser can translate at all: its own translator, or Starcom's model in a worker. */
const translatesHere = () => browserTranslates() || modelTranslates('en', 'de');

/**
 * `publicContent`: whether the words are Public, the only content that may ever go to the cloud on the
 * person's own key (ML6). Anything not said to be Public is never sent.
 * `sourceLanguage`: the language the words are in, where whoever wrote them says (Mecha Jono's titles are
 * English): then nothing is guessed, short words are not mistaken, and a reader in it is offered nothing.
 */
const Translatable: React.FC<{ text: string; publicContent?: boolean; sourceLanguage?: string; testId?: string }> = ({ text, publicContent = false, sourceLanguage, testId = 'translatable' }) => {
  const { lang, m: { translate: t } } = useMessages();
  const target = translatorTag(lang);
  const [step, setStep] = useState<Step>({ at: 'idle' });
  const [hidden, setHidden] = useState(true);
  const names = new Intl.DisplayNames([languageOf(lang).html], { type: 'language' });
  const nameOf = (code: string) => names.of(code) ?? code;

  // Offered only where the words seem to be in another language, and the browser translates for pages.
  useEffect(() => {
    setStep({ at: 'idle' });
    let live = true;
    if (!(translatesHere() || (publicContent && cloudKey())) || !text.trim()) { setHidden(true); return undefined; }
    if (sourceLanguage) { setHidden(sourceLanguage === target); return undefined; }
    const guess = seemsWrittenIn(text);
    setHidden(guess[0] === target);
    void detected(text, false).then((found) => { if (live && found) setHidden(found.split('-')[0] === target); });
    return () => { live = false; };
  }, [text, target, publicContent, sourceLanguage]);

  if (hidden) return null;

  /** Starcom's own translator: fetched first if it is not kept here, the progress said throughout. */
  const byModel = async (source: string) => {
    setStep({ at: 'model', source, progress: {} });
    try {
      const words = await translateWithModel(text, source, target, (progress) => setStep({ at: 'model', source, progress }));
      setStep({ at: 'done', source, words, by: 'model' });
    } catch (e) {
      setStep({ at: 'said', words: fill(t.failed, { reason: e instanceof Error ? e.message : String(e) }) });
    }
  };

  /** The cloud, on the person's own key: only ever reached for Public content (ML6). */
  const byCloud = async (source: string) => {
    const key = cloudKey();
    if (!key || !publicContent) return;
    setStep({ at: 'cloud', provider: key.provider });
    try {
      const words = await translateInCloud(text, source, target, key);
      setStep({ at: 'done', source, words, by: key.provider });
    } catch (e) {
      setStep({ at: 'said', words: fill(t.failed, { reason: e instanceof Error ? e.message : String(e) }) });
    }
  };

  // On this device first: the browser's own translator where it has the pair, else Starcom's model when it
  // is kept here. Else the person chooses: fetch the model, or, for Public content, their own key's cloud.
  const translate = async (source: string) => {
    if (source === target) { setStep({ at: 'said', words: fill(t.same, { language: nameOf(target) }) }); return; }
    const state = await packState(source, target);
    if (state === 'unavailable') {
      const model = modelTranslates(source, target);
      const cloud = publicContent ? cloudKey()?.provider ?? null : null;
      if (!model && !cloud) { setStep({ at: 'said', words: fill(t.ownCannot, { source: nameOf(source) }) }); return; }
      if (model && await modelKept()) { await byModel(source); return; }
      const why = browserTranslates() ? fill(t.cannot, { source: nameOf(source), target: nameOf(target) }) : '';
      setStep({ at: 'offer', source, why, model, cloud });
      return;
    }
    setStep(state === 'available' ? { at: 'translating' } : { at: 'fetching', source, share: 0 });
    try {
      const words = await translateHere(text, source, target, (share) => setStep(share < 1 ? { at: 'fetching', source, share } : { at: 'translating' }));
      setStep({ at: 'done', source, words, by: 'browser' });
    } catch (e) {
      setStep({ at: 'said', words: fill(t.failed, { reason: e instanceof Error ? e.message : String(e) }) });
    }
  };

  const modelSays = (p: ModelProgress) => (p.fetched !== undefined && p.fetched < 1
    ? fill(t.ownFetching, { percent: Math.round(p.fetched * 100) })
    : p.of ? fill(t.ownTranslating, { n: (p.done ?? 0) + 1, total: p.of }) : t.ownLoading);

  // The click may fetch the browser's detector; else the words' own signs; else the person says.
  const start = async () => {
    if (sourceLanguage) { await translate(sourceLanguage); return; }
    const found = await detected(text, true);
    const guess = seemsWrittenIn(text);
    const source = found?.split('-')[0] ?? (guess.length === 1 ? guess[0] : null);
    if (source) await translate(source);
    else setStep({ at: 'choosing', source: guess[0] ?? CHOICES.find((c) => c !== target)! });
  };

  return (
    <div className={styles.translatable} data-testid={testId}>
      {step.at === 'idle' && (
        <button type="button" className={styles.button} onClick={() => void start()}>
          {fill(t.button, { language: nameOf(target) })}
        </button>
      )}
      {step.at === 'choosing' && (
        <div className={styles.row}>
          <label className={styles.label}>
            {t.writtenIn}{' '}
            <select value={step.source} onChange={(e) => setStep({ at: 'choosing', source: e.target.value })} data-testid={`${testId}-source`}>
              {CHOICES.map((c) => <option key={c} value={c}>{nameOf(c)}</option>)}
            </select>
          </label>
          <button type="button" className={styles.button} onClick={() => void translate(step.source)}>{t.go}</button>
          <button type="button" className={styles.button} onClick={() => setStep({ at: 'idle' })}>{t.cancel}</button>
        </div>
      )}
      {step.at === 'fetching' && (
        <p className={styles.note} role="status">{fill(t.fetching, { source: nameOf(step.source), percent: Math.round(step.share * 100) })}</p>
      )}
      {step.at === 'translating' && <p className={styles.note} role="status">{t.translating}</p>}
      {step.at === 'offer' && (
        <div className={styles.offer} data-testid={`${testId}-offer`}>
          {step.why && <p className={styles.note}>{step.why}</p>}
          {step.model && <p className={styles.note}>{t.own}</p>}
          {step.cloud && <p className={styles.note}>{fill(t.cloudNote, { provider: PROVIDER_NAMES[step.cloud] })}</p>}
          <div className={styles.row}>
            {step.model && <button type="button" className={styles.button} onClick={() => void byModel(step.source)}>{t.ownGo}</button>}
            {step.cloud && (
              <button type="button" className={styles.button} onClick={() => void byCloud(step.source)}>
                {fill(t.cloudGo, { provider: PROVIDER_NAMES[step.cloud] })}
              </button>
            )}
            <button type="button" className={styles.button} onClick={() => setStep({ at: 'idle' })}>{t.ownNotNow}</button>
          </div>
        </div>
      )}
      {step.at === 'model' && <p className={styles.note} role="status">{modelSays(step.progress)}</p>}
      {step.at === 'cloud' && <p className={styles.note} role="status">{t.translating}</p>}
      {step.at === 'said' && <p className={styles.note} role="status">{step.words}</p>}
      {step.at === 'done' && (
        <div className={styles.translation} data-testid={`${testId}-done`}>
          <p className={styles.mark}>
            {step.by === 'browser' ? fill(t.from, { language: nameOf(step.source) })
              : step.by === 'model' ? fill(t.fromOwn, { language: nameOf(step.source) })
                : fill(t.fromCloud, { language: nameOf(step.source), provider: PROVIDER_NAMES[step.by] })}
          </p>
          <p className={styles.words} lang={target}>{step.words}</p>
          <button type="button" className={styles.button} onClick={() => setStep({ at: 'idle' })}>{t.hide}</button>
        </div>
      )}
    </div>
  );
};

export default Translatable;
