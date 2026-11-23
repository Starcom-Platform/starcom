/**
 * Uplink's key window (decision D-EX, E3, EX40): where the person sets the passphrase that seals their key,
 * or types it to unlock the key for this browser session. Starcom's page never sees the passphrase.
 */
import { nip19 } from 'nostr-tools';
import { passphraseProblem } from '../../../src/extension/uplink/keyStore';
import { applyTheme, text } from '../../lib/theme';
import { asks, asksButton, wordsHere } from '../../lib/words';
import { uplinkEn } from '../../../src/i18n/uplink/en';

applyTheme();
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const setting = params.get('mode') === 'set';
const pubkey = params.get('pubkey') ?? '';
const npub = /^[0-9a-f]{64}$/.test(pubkey) ? nip19.npubEncode(pubkey) : pubkey;

const answer = async (passphrase: string | null) => {
  await browser.runtime.sendMessage({ via: 'key', id, answer: passphrase });
  window.close();
};

/** Drawn once Uplink's words for the language shown are read. */
async function main(): Promise<void> {
  const root = document.getElementById('root')!;
  const { lang, m } = await wordsHere();
  const t = m.key;
  const en = uplinkEn.key;
  root.append(asks(lang, 'h1', setting ? t.keepHeading : t.unlockHeading, setting ? en.keepHeading : en.unlockHeading));
  root.append(text('p', `${npub.slice(0, 18)}…${npub.slice(-8)}`, 'mono'));
  root.append(asks(lang, 'p', t.why, en.why, 'muted'));
  // Starcom's purpose, with its English beneath when Starcom said it in another language.
  const purpose = params.get('purpose') ?? '';
  root.append(asks(lang, 'p', purpose, params.get('purposeEnglish') ?? purpose));
  if (setting) {
    root.append(asks(lang, 'p', t.choose, en.choose, 'muted'));
    root.append(asks(lang, 'p', t.noRecovery, en.noRecovery, 'muted'));
  }
  // A note from the key store is said in the language shown; one Uplink does not know, as it came.
  const note = params.get('note');
  const said = text('p', note === en.wrongPassphrase ? t.wrongPassphrase : note === en.notThisKey ? t.notThisKey : note ?? '', 'muted');
  said.setAttribute('role', 'alert');
  const field = (label: string) => {
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = setting ? 'new-password' : 'current-password';
    input.setAttribute('aria-label', label);
    input.placeholder = label;
    input.style.cssText = 'font: inherit; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--rule); background: var(--panel); color: var(--heading);';
    return input;
  };
  const first = field(setting ? t.newPassphrase : t.passphrase);
  const second = setting ? field(t.again) : null;
  root.append(first, ...(second ? [second] : []), said);
  first.focus();

  const row = document.createElement('div');
  row.className = 'row';
  const go = asksButton(lang, setting ? t.seal : t.unlock, setting ? en.seal : en.unlock, 'primary');
  const submit = () => {
    const words = first.value;
    if (setting) {
      // The page's field always holds words, so the one problem it can have is length.
      if (passphraseProblem(words)) { said.textContent = t.tooShort; return; }
      if (words !== second!.value) { said.textContent = t.notSame; return; }
    }
    if (!words) { said.textContent = t.typeIt; return; }
    void answer(words);
  };
  go.addEventListener('click', submit);
  for (const input of [first, second]) input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const cancel = asksButton(lang, setting ? t.cancel : t.notNow, setting ? en.cancel : en.notNow);
  cancel.addEventListener('click', () => void answer(null));
  row.append(go, cancel);
  root.append(row);
}
void main();
