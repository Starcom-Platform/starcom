/**
 * Uplink's grant window (decision D-EX, E0): Starcom asked to reach some sites. It says why, in the
 * words the request carried, and the person's click is the browser's own permission prompt.
 */
import { ALL_SITES } from '../../../src/extension/uplink/handlers';
import { applyTheme, text } from '../../lib/theme';
import { asks, asksButton, wordsHere } from '../../lib/words';
import { uplinkEn } from '../../../src/i18n/uplink/en';

applyTheme();
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const purpose = params.get('purpose') ?? '';
let origins: string[] = [];
try { origins = JSON.parse(params.get('origins') ?? '[]'); } catch { origins = []; }
const allSites = ALL_SITES.every((o) => origins.includes(o));

/** Drawn once Uplink's words for the language shown are read. */
async function main(): Promise<void> {
  const root = document.getElementById('root')!;
  const { lang, m } = await wordsHere();
  const t = m.grant;
  const en = uplinkEn.grant;
  root.append(asks(lang, 'h1', t.heading, en.heading));
  if (allSites) {
    root.append(asks(lang, 'p', t.everySite, en.everySite));
  } else {
    const list = document.createElement('div');
    for (const origin of origins) list.append(text('div', origin.replace(/\/\*$/, ''), 'mono'));
    root.append(list);
  }
  root.append(asks(lang, 'p', t.why, en.why, 'muted'));
  // The purpose, with its English beneath when it was said in another language.
  root.append(asks(lang, 'p', purpose, params.get('purposeEnglish') ?? purpose));
  root.append(asks(lang, 'p', t.logged, en.logged, 'muted'));

  const answer = async (granted: boolean) => {
    await browser.runtime.sendMessage({ via: 'grant', id, granted });
    window.close();
  };
  const row = document.createElement('div');
  row.className = 'row';
  const allow = asksButton(lang, t.allow, en.allow, 'primary');
  allow.addEventListener('click', async () => {
    // The browser's own prompt follows this click; its answer is the answer.
    const granted = await browser.permissions.request({ origins }).catch(() => false);
    await answer(granted);
  });
  const decline = asksButton(lang, t.decline, en.decline);
  decline.addEventListener('click', () => void answer(false));
  row.append(allow, decline);
  root.append(row);
}
void main();
