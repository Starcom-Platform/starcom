/** Uplink's popup (decision D-EX, E0): its version, what it may reach, and the ways in. */
import { isStarcomPattern } from '../../../src/extension/uplink/handlers';
import { applyTheme, text } from '../../lib/theme';
import { wordsHere } from '../../lib/words';
import { interpolate } from '../../../src/i18n/messages';
import { countedIn } from '../../../src/i18n/app/plain';
import { languageOf } from '../../../src/i18n/app/languages';

applyTheme();
const root = document.getElementById('root')!;
async function render() {
const { lang, m } = await wordsHere();
const t = m.popup;
root.append(text('h1', 'Starcom Uplink'));
root.append(text('p', interpolate(t.version, { version: browser.runtime.getManifest().version }), 'muted'));
if (!languageOf(lang).reviewed) root.append(text('p', interpolate(m.draft, { language: languageOf(lang).name }), 'muted'));
const granted = ((await browser.permissions.getAll()).origins ?? []).filter((o) => !isStarcomPattern(o));
root.append(text('p', granted.length ? countedIn(lang, t.mayReach, granted.length) : t.mayReachNone));
// "Send this page to Starcom": as the right-click does, for the page this popup was opened on (W7).
const sendPage = text('button', t.sendPage, 'primary');
const sentWords = text('p', '', 'muted');
sendPage.addEventListener('click', () => {
  sendPage.setAttribute('disabled', '');
  void browser.runtime.sendMessage({ via: 'popup', action: 'send-page' }).then((said: { sent?: string; refused?: string } | undefined) => {
    sentWords.textContent = said?.refused ?? t.sent;
  });
});
// "Capture this page as evidence" (W8): its picture, HTML and text, hashed, for a case.
const evidence = text('button', t.captureEvidence);
evidence.addEventListener('click', () => {
  evidence.setAttribute('disabled', '');
  void browser.runtime.sendMessage({ via: 'popup', action: 'capture-evidence' }).then((said: { sent?: string; refused?: string } | undefined) => {
    sentWords.textContent = said?.refused ?? t.captured;
    if (said?.sent === 'evidence, not timestamped') sentWords.textContent += ` ${t.notTimestamped}`;
  });
});
root.append(sendPage, evidence, sentWords);
const row = document.createElement('div');
row.className = 'row';
const open = text('button', t.openStarcom);
open.addEventListener('click', () => void browser.tabs.create({ url: 'https://starcom.app/' }));
const panel = text('button', t.sidePanel);
panel.title = t.sidePanelMeans;
panel.addEventListener('click', () => {
  // Opened on this click: the browser opens a side panel only on the person's own gesture.
  const sidePanel = (browser as unknown as { sidePanel?: { open(o: { windowId: number }): Promise<void> } }).sidePanel;
  const sidebar = (browser as unknown as { sidebarAction?: { open(): Promise<void> } }).sidebarAction;
  if (sidePanel) void browser.windows.getCurrent().then((w) => sidePanel.open({ windowId: w.id! })).then(() => window.close());
  else if (sidebar) void sidebar.open().then(() => window.close());
});
const log = text('button', t.activityLog);
log.addEventListener('click', () => void browser.runtime.openOptionsPage());
row.append(open, panel, log);
root.append(row);
}
void render();
