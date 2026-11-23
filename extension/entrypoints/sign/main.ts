/**
 * Uplink's signing window (decision D-EX, E3, EX41): before it signs anything public as the person, it
 * shows what it is, its words, and Starcom's reason, and signs only if they agree.
 */
import { applyTheme, text } from '../../lib/theme';
import { asks, asksButton, wordsHere } from '../../lib/words';
import { uplinkEn } from '../../../src/i18n/uplink/en';
import { interpolate } from '../../../src/i18n/messages';
import { kindWords } from '../../../src/extension/uplink/signerRules';
import type { SignSummary } from '../../../src/extension/uplink/handlers';

applyTheme();
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
let summary: SignSummary | null = null;
try { summary = JSON.parse(params.get('summary') ?? 'null'); } catch { summary = null; }

const answer = async (said: 'sign' | 'declined') => {
  await browser.runtime.sendMessage({ via: 'sign', id, answer: said });
  window.close();
};

/** Drawn once Uplink's words for the language shown are read. */
async function main(): Promise<void> {
  const root = document.getElementById('root')!;
  const { lang, m } = await wordsHere();
  const t = m.sign;
  const en = uplinkEn.sign;
  root.append(asks(lang, 'h1', t.heading, en.heading));
  if (!summary) {
    root.append(asks(lang, 'p', t.unreadable, en.unreadable));
  } else {
    // What it is, in the words of the language shown, by its kind (the English beneath, by the same kind).
    root.append(asks(lang, 'p',
      interpolate(t.asks, { what: kindWords(summary.kind, m) }),
      interpolate(en.asks, { what: kindWords(summary.kind) })));
    if (summary.title) root.append(text('p', summary.title, 'mono'));
    const words = text('p', summary.words.length >= 600 ? `${summary.words}…` : summary.words || t.noWords, 'muted');
    words.style.cssText = 'max-height: 160px; overflow: auto; white-space: pre-wrap; border: 1px solid var(--rule); padding: 6px 8px; border-radius: 4px;';
    root.append(words);
    root.append(asks(lang, 'p', t.why, en.why, 'muted'));
    // Starcom's purpose, with its English beneath when Starcom said it in another language.
    const purpose = params.get('purpose') ?? '';
    root.append(asks(lang, 'p', purpose, params.get('purposeEnglish') ?? purpose));
    root.append(asks(lang, 'p', t.logged, en.logged, 'muted'));
  }
  const row = document.createElement('div');
  row.className = 'row';
  if (summary) {
    const sign = asksButton(lang, t.sign, en.sign, 'primary');
    sign.addEventListener('click', () => void answer('sign'));
    row.append(sign);
  }
  const no = asksButton(lang, t.dontSign, en.dontSign);
  no.addEventListener('click', () => void answer('declined'));
  row.append(no);
  root.append(row);
}
void main();
