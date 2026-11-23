/**
 * Uplink's options (decision D-EX, E0): the activity log, every site it may reach with a way to take
 * each back, power mode, timestamps for evidence (W8c), and the person's key (E3, K7): whose it is,
 * whether it is unlocked, a way to lock it now, and the sealed key to keep as a backup.
 */
import { nip19 } from 'nostr-tools';
import { STORED_KEY, UNLOCKED_KEY, type StoredKey } from '../../../src/extension/uplink/keyStore';
import type { ActivityEntry } from '../../../src/extension/protocol';
import { ALL_SITES, isStarcomPattern } from '../../../src/extension/uplink/handlers';
import { OTS_CALENDAR_ORIGINS, TIMESTAMPS_SETTING_KEY } from '../../../src/extension/uplink/opentimestamps';
import { applyTheme, text } from '../../lib/theme';
import { wordsHere } from '../../lib/words';
import { interpolate } from '../../../src/i18n/messages';
import { languageOf } from '../../../src/i18n/app/languages';

applyTheme();
const root = document.getElementById('root')!;

async function render() {
  const { lang, m } = await wordsHere();
  const t = m.options;
  root.replaceChildren();
  root.append(text('h1', 'Starcom Uplink'));
  if (!languageOf(lang).reviewed) root.append(text('p', interpolate(m.draft, { language: languageOf(lang).name }), 'muted'));

  // The sites it may reach, each with a way to take it back.
  root.append(text('h1', t.sites));
  // Starcom's own pages, which the bridge runs on, are not sites the person allowed.
  const origins = ((await browser.permissions.getAll()).origins ?? []).filter((o) => !isStarcomPattern(o));
  const powerMode = ALL_SITES.every((o) => origins.includes(o));
  if (!origins.length) root.append(text('p', t.noSites, 'muted'));
  for (const origin of origins) {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(text('span', origin, 'mono'));
    const remove = text('button', t.takeBack);
    remove.addEventListener('click', async () => {
      await browser.permissions.remove({ origins: [origin] });
      // A calendar taken back is a "no" to timestamps: Uplink does not ask again at the next capture.
      if (OTS_CALENDAR_ORIGINS.includes(origin)) await browser.storage.local.set({ [TIMESTAMPS_SETTING_KEY]: 'declined' });
      await render();
    });
    row.append(remove);
    root.append(row);
  }
  const power = text('button', powerMode ? t.powerOff : t.powerOn, powerMode ? '' : 'primary');
  power.addEventListener('click', async () => {
    if (powerMode) await browser.permissions.remove({ origins: [...ALL_SITES] });
    else await browser.permissions.request({ origins: [...ALL_SITES] }).catch(() => false);
    await render();
  });
  root.append(power);

  // The key (E3): Uplink signs as the person, so the person sees whose key it holds and can lock it.
  root.append(text('h1', t.key));
  const stored = ((await browser.storage.local.get(STORED_KEY))[STORED_KEY] as StoredKey | undefined) ?? null;
  if (!stored) {
    root.append(text('p', t.noKey, 'muted'));
  } else {
    const unlocked = typeof (await browser.storage.session.get(UNLOCKED_KEY))[UNLOCKED_KEY] === 'string';
    root.append(text('p', nip19.npubEncode(stored.pubkey), 'mono'));
    root.append(text('p', unlocked ? t.unlocked : t.locked, 'muted'));
    const row = document.createElement('div');
    row.className = 'row';
    if (unlocked) {
      const lock = text('button', t.lockNow);
      lock.addEventListener('click', async () => { await browser.storage.session.remove(UNLOCKED_KEY); await render(); });
      row.append(lock);
    }
    const copy = text('button', t.copySealed);
    copy.addEventListener('click', async () => {
      // Sealed under the passphrase (NIP-49): useless without it, so it can be kept anywhere.
      await navigator.clipboard.writeText(stored.ncryptsec).then(() => { copy.textContent = t.copied; }, () => { copy.textContent = stored.ncryptsec; });
    });
    row.append(copy);
    root.append(row);
  }

  // Timestamps for evidence (W8c): a blinded hash to two public calendars, proof of when it existed.
  root.append(text('h1', t.timestamps));
  const timestamping = await browser.permissions.contains({ origins: OTS_CALENDAR_ORIGINS });
  root.append(text('p', timestamping ? t.timestampsOn : t.timestampsOff, 'muted'));
  const toggle = text('button', timestamping ? t.turnTimestampsOff : t.turnTimestampsOn, timestamping ? '' : 'primary');
  toggle.addEventListener('click', async () => {
    if (timestamping) await browser.permissions.remove({ origins: OTS_CALENDAR_ORIGINS });
    else await browser.permissions.request({ origins: OTS_CALENDAR_ORIGINS }).catch(() => false);
    const on = await browser.permissions.contains({ origins: OTS_CALENDAR_ORIGINS });
    await browser.storage.local.set({ [TIMESTAMPS_SETTING_KEY]: on ? 'allowed' : 'declined' });
    await render();
  });
  root.append(toggle);

  // The activity log, newest first.
  root.append(text('h1', t.activity));
  const kept = await browser.storage.local.get('activity');
  const log = ((kept.activity as ActivityEntry[] | undefined) ?? []).slice().reverse();
  if (!log.length) { root.append(text('p', t.nothingYet, 'muted')); return; }
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const h of [t.columns.when, t.columns.what, t.columns.why, t.columns.outcome]) head.append(text('th', h));
  table.append(head);
  for (const e of log.slice(0, 500)) {
    const tr = document.createElement('tr');
    tr.append(
      text('td', new Date(e.at).toISOString().replace('T', ' ').slice(0, 19) + 'Z', 'mono'),
      text('td', `${e.target ? `${e.capability} · ${e.target}` : e.capability}${e.times ? ` ×${e.times}` : ''}`, 'mono'),
      text('td', e.purpose),
      text('td', e.outcome === 'ok' ? t.done : `${m.refusals[e.outcome]}${e.detail ? `: ${e.detail}` : ''}`),
    );
    table.append(tr);
  }
  root.append(table);
}
void render();
