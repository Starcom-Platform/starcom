/**
 * Uplink's background (decision D-EX, E0): it wires the browser to the decisions in
 * src/extension/uplink/handlers.ts, which are tested with the app's own tests. Nothing is decided here.
 */
import type { ActivityEntry, Capture } from '../../src/extension/protocol';
import { CAPTURES_KEY, INBOX_KEY, badgeFor, captureFromClick, keptOut, queueWith, sentKind, whatWasSent } from '../../src/extension/uplink/captures';
import { evidenceFromPage, fileKey, fileKeysOf, scaledSize, type PageRead } from '../../src/extension/uplink/evidence';
import { bytesToBase64 } from '../../src/extension/bytes';
import {
  OTS_CALENDARS, OTS_CALENDAR_ORIGINS, TIMESTAMPS_SETTING_KEY, attachCalendar, detachedProof, prepareStamp,
} from '../../src/extension/uplink/opentimestamps';
import type { EvidenceTimestamps } from '../../src/extension/protocol';
import { handleToUplink, starcomSenderUrl, withEntry, type UplinkHost } from '../../src/extension/uplink/handlers';
import { addressProblem, paceWait, readCapped } from '../../src/extension/uplink/siteFetch';
import { STORED_KEY, UNLOCKED_KEY, type StoredKey } from '../../src/extension/uplink/keyStore';
import { CYAN, GUNMETAL, SEMANTIC } from '../../src/styles/tokens';
import { bridgePages } from '../lib/pages';
import { UPLINK_LANGUAGE_KEY, uplinkWords } from '../../src/i18n/uplink/uplinkWords';
import { interpolate } from '../../src/i18n/messages';
import { uplinkEn } from '../../src/i18n/uplink/en';

const ACTIVITY_KEY = 'activity';
/** The right-click item that sends a selection, link, image or page to Starcom (E2). */
const SEND = 'send-to-starcom';
/** The right-click item that captures a page as evidence (W8). */
const EVIDENCE = 'capture-evidence';

/** One change to Uplink's storage at a time: two quick captures must never each write over the other. */
let storageTail: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(change: () => Promise<T>): Promise<T> => {
  const run = storageTail.then(change, change);
  storageTail = run.catch(() => undefined);
  return run;
};
const readStored = async <T>(key: string, empty: T): Promise<T> =>
  ((await browser.storage.local.get(key))[key] as T | undefined) ?? empty;

/** A purpose's English, passed to Uplink's window beside it, when it was said in another language (ML9). */
const inEnglish = (english: string | undefined): Record<string, string> => (english ? { purposeEnglish: english } : {});

/** Uplink's words now: the language a Starcom page last showed (D-ML, ML8), else the browser's. */
const wordsNow = async () => uplinkWords(await readStored<string | null>(UPLINK_LANGUAGE_KEY, null), navigator.languages ?? [navigator.language]);

/** The right-click items, named in Uplink's language: made at install, renamed when the language changes. */
const titleMenus = async () => {
  const { m } = await wordsNow();
  await browser.contextMenus.update(SEND, { title: m.menu.send }).catch(() => undefined);
  await browser.contextMenus.update(EVIDENCE, { title: m.menu.evidence }).catch(() => undefined);
};

/** The toolbar icon counts every capture not yet filed: waiting for Starcom, and in Starcom's inbox (W7). */
const showWaiting = async () => {
  const waiting = (await readStored<Capture[]>(CAPTURES_KEY, [])).length;
  const badge = badgeFor(waiting, await readStored<number>(INBOX_KEY, 0), (await wordsNow()).m.icon);
  await browser.action.setBadgeBackgroundColor({ color: CYAN[400] });
  await browser.action.setBadgeTextColor?.({ color: GUNMETAL[950] });
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setTitle({ title: badge.title });
};

/** A capture refused: said on the icon for a few seconds, and kept in the activity log with why. */
const tellRefused = async (reason: string) => {
  await browser.action.setBadgeBackgroundColor({ color: SEMANTIC.caution });
  await browser.action.setBadgeText({ text: '!' });
  await browser.action.setTitle({ title: interpolate((await wordsNow()).m.icon.refused, { reason }) });
  setTimeout(() => { void showWaiting(); }, 6000);
};
/** Grant windows still open, by id, each waiting for the person's answer. */
const awaitingGrant = new Map<string, (said: 'granted' | 'declined') => void>();
/** When each site was last read for NetRunner, or is next due: two reads of one site keep a gap (W10a). */
const lastRead = new Map<string, number>();
/** Uplink's own windows still open, by id, each waiting for the person's answer (E3: passphrase, signing). */
const awaitingAnswer = new Map<string, (answer: unknown) => void>();

/** One of Uplink's own windows, opened to ask the person something; closed without an answer, `closed`. */
function askInWindow<T>(page: 'key' | 'sign', params: Record<string, string>, size: { width: number; height: number }, closed: T): Promise<T> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    awaitingAnswer.set(id, (answer) => resolve(answer as T));
    const query = new URLSearchParams({ id, ...params }).toString();
    const url = page === 'key' ? browser.runtime.getURL(`/key.html?${query}`) : browser.runtime.getURL(`/sign.html?${query}`);
    void browser.windows.create({ url, type: 'popup', ...size }).then((made) => {
      const gone = (windowId: number) => {
        if (windowId !== made?.id) return;
        browser.windows.onRemoved.removeListener(gone);
        awaitingAnswer.get(id)?.(closed);
        awaitingAnswer.delete(id);
      };
      browser.windows.onRemoved.addListener(gone);
    });
  });
}
const hexOf = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));

/** The browser behind the handlers' face. Made when the background starts: WXT reads this file in Node to build. */
const makeHost = (): UplinkHost => ({
  version: browser.runtime.getManifest().version,
  now: () => Date.now(),
  async readActivity() {
    const stored = await browser.storage.local.get(ACTIVITY_KEY);
    return (stored[ACTIVITY_KEY] as ActivityEntry[] | undefined) ?? [];
  },
  appendActivity: (entry) => oneAtATime(async () => {
    const log = await readStored<ActivityEntry[]>(ACTIVITY_KEY, []);
    await browser.storage.local.set({ [ACTIVITY_KEY]: withEntry(log, entry) });
  }),
  readCaptures: () => readStored<Capture[]>(CAPTURES_KEY, []),
  setInboxCount: async (count) => { await browser.storage.local.set({ [INBOX_KEY]: count }); },
  readInboxCount: () => readStored<number>(INBOX_KEY, 0),
  releaseCaptures: (ids) => oneAtATime(async () => {
    const before = await readStored<Capture[]>(CAPTURES_KEY, []);
    const { queue, released } = keptOut(before, ids);
    await browser.storage.local.set({ [CAPTURES_KEY]: queue });
    // An evidence capture's files go with it, once Starcom has kept them.
    const files = before.filter((c) => ids.includes(c.id)).flatMap(fileKeysOf);
    if (files.length) await browser.storage.local.remove(files);
    return released;
  }),
  async readCaptureFile(captureId, name) {
    const key = fileKey(captureId, name);
    const stored = (await browser.storage.local.get(key))[key];
    return typeof stored === 'string' ? stored : null;
  },
  async grantedOrigins() {
    return (await browser.permissions.getAll()).origins ?? [];
  },
  words: async () => (await wordsNow()).m,
  async rememberLanguage(language) {
    if ((await readStored<string | null>(UPLINK_LANGUAGE_KEY, null)) === language) return;
    await browser.storage.local.set({ [UPLINK_LANGUAGE_KEY]: language });
    await titleMenus();
    await showWaiting();
  },
  readStoredKey: () => readStored<StoredKey | null>(STORED_KEY, null),
  saveStoredKey: async (key) => { await browser.storage.local.set({ [STORED_KEY]: key }); },
  // The opened key waits in session storage: cleared when the browser closes, kept while this background
  // sleeps, and readable only by Uplink's own pages and background, never by a content script.
  async readUnlocked() {
    const held = (await browser.storage.session.get(UNLOCKED_KEY))[UNLOCKED_KEY];
    return typeof held === 'string' && /^[0-9a-f]{64}$/.test(held) ? bytesOf(held) : null;
  },
  async rememberUnlocked(secret) {
    if (secret) await browser.storage.session.set({ [UNLOCKED_KEY]: hexOf(secret) });
    else await browser.storage.session.remove(UNLOCKED_KEY);
  },
  askPassphrase: (mode, purpose, pubkey, note, purposeInEnglish) =>
    askInWindow<string | null>('key', { mode, purpose, pubkey, ...(note ? { note } : {}), ...inEnglish(purposeInEnglish) }, { width: 460, height: mode === 'set' ? 470 : 380 }, null),
  askToSign: (summary, purpose, purposeInEnglish) =>
    askInWindow<'sign' | 'declined'>('sign', { summary: JSON.stringify(summary), purpose, ...inEnglish(purposeInEnglish) }, { width: 500, height: 460 }, 'declined'),
  async fetchSite(request) {
    // Checked already in the handlers: a public site the person allowed, GET or HEAD (EX32).
    const site = new URL(request.url).host;
    const wait = paceWait(lastRead.get(site), Date.now());
    lastRead.set(site, Date.now() + wait);
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), request.timeoutMs);
    const started = Date.now();
    try {
      // Never as the person: no cookies, no referrer, nothing from the cache.
      const response = await fetch(request.url, {
        method: request.method, credentials: 'omit', cache: 'no-store', redirect: 'follow', referrerPolicy: 'no-referrer',
        headers: request.accept ? { Accept: request.accept } : {}, signal: stop.signal,
      });
      const finalUrl = response.url || request.url;
      // A redirect can end where Uplink never reads; what came back from there is not kept.
      const ended = addressProblem(new URL(finalUrl).hostname);
      if (ended) {
        await response.body?.cancel();
        return { failed: `it redirected to an address Uplink never reads: ${ended}` };
      }
      const read = await readCapped(response.body, request.maxBytes);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      return {
        fetched: {
          status: response.status, statusText: response.statusText, headers,
          body: new TextDecoder().decode(read.bytes), finalUrl, redirected: response.redirected,
          elapsedMs: Date.now() - started, bytes: read.size, truncated: read.truncated, sha256: await sha256Hex(read.bytes),
        },
      };
    } catch (error) {
      return {
        failed: stop.signal.aborted
          ? `no answer within ${request.timeoutMs / 1000} s`
          : `the browser could not reach it (${error instanceof Error ? error.message : String(error)})`,
      };
    } finally {
      clearTimeout(timer);
    }
  },
  askToGrant(origins, purpose, purposeInEnglish) {
    // The browser grants a site only on the person's own click: Uplink's grant window gives them one.
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      awaitingGrant.set(id, resolve);
      const query = new URLSearchParams({ id, origins: JSON.stringify(origins), purpose, ...inEnglish(purposeInEnglish) }).toString();
      const url = browser.runtime.getURL(`/grant.html?${query}`);
      void browser.windows.create({ url, type: 'popup', width: 460, height: 380 }).then((made) => {
        const closed = (windowId: number) => {
          if (windowId !== made?.id) return;
          browser.windows.onRemoved.removeListener(closed);
          // Closed without an answer: declined.
          awaitingGrant.get(id)?.('declined');
          awaitingGrant.delete(id);
        };
        browser.windows.onRemoved.addListener(closed);
      });
    });
  },
});

/** "Send to Starcom": the capture kept until Starcom takes it, or refused with why; either way, logged. */
async function send(host: UplinkHost, info: Parameters<typeof captureFromClick>[0], tab: { url?: string; title?: string } | undefined) {
  const made = captureFromClick(info, tab, host.now(), crypto.randomUUID());
  const kept = 'refused' in made ? made : await oneAtATime(async () => {
    const next = queueWith(await readStored<Capture[]>(CAPTURES_KEY, []), made.capture);
    if ('queue' in next) await browser.storage.local.set({ [CAPTURES_KEY]: next.queue });
    return next;
  });
  const page = info.pageUrl ?? tab?.url;
  await host.appendActivity({
    at: host.now(), capability: 'capture', purpose: (await wordsNow()).m.sent.what[sentKind(info)],
    ...(page ? { target: page } : {}),
    ...('refused' in kept ? { outcome: 'refused', detail: kept.refused } : { outcome: 'ok' }),
  });
  if ('refused' in kept) await tellRefused(kept.refused);
  return 'refused' in kept ? { refused: kept.refused } : { sent: whatWasSent(info) };
}

/** Read inside the page at the person's click (EX21): what it says, as HTML and as text. Self-contained. */
function readPage(): PageRead {
  const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : '';
  return { url: location.href, title: document.title, html: doctype + document.documentElement.outerHTML, text: document.body ? document.body.innerText : '' };
}

const sha256Hex = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The tab's picture, scaled to one width (EX22): its size tells nothing of the screen it was taken on. */
async function scaledPicture(dataUrl: string): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas to scale the picture on');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
const sha256Bytes = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/** Whether evidence may be timestamped: allowed already, or asked now, once, in Uplink's own window. */
async function timestampsAllowed(host: UplinkHost): Promise<boolean> {
  if (await browser.permissions.contains({ origins: OTS_CALENDAR_ORIGINS })) return true;
  if ((await readStored<string | null>(TIMESTAMPS_SETTING_KEY, null)) === 'declined') return false;
  const said = await host.askToGrant(OTS_CALENDAR_ORIGINS, (await wordsNow()).m.timestampPurpose, uplinkEn.timestampPurpose);
  await browser.storage.local.set({ [TIMESTAMPS_SETTING_KEY]: said === 'granted' ? 'allowed' : 'declined' });
  return said === 'granted' && browser.permissions.contains({ origins: OTS_CALENDAR_ORIGINS });
}

/**
 * The capture's files timestamped (W8c, EX18): each file's proof built as the official client builds it,
 * the tip sent to both calendars, every answer laid over it. Only the blinded tip leaves this browser.
 */
async function timestampEvidence(host: UplinkHost, capture: Capture): Promise<{ timestamps: EvidenceTimestamps } | { note: string }> {
  const files = capture.files ?? [];
  const hashes = files.map((f) => fromHex(f.sha256));
  const { tip, leaves, tipStamp } = await prepareStamp(hashes, files.map(() => crypto.getRandomValues(new Uint8Array(16))), sha256Bytes);
  const answered: string[] = [];
  await Promise.all(OTS_CALENDARS.map(async (calendar) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 10_000);
    try {
      const response = await fetch(`${calendar}/digest`, { method: 'POST', body: tip, headers: { Accept: 'application/vnd.opentimestamps.v1' }, signal: stop.signal });
      const answer = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || answer.length > 10_000) return;
      attachCalendar(tipStamp, answer, tip);
      answered.push(calendar);
    } catch { /* this calendar did not answer: the other may */ } finally {
      clearTimeout(timer);
    }
  }));
  await host.appendActivity({
    at: host.now(), capability: 'timestamp', purpose: (await wordsNow()).m.timestampPurpose, target: OTS_CALENDARS.map((c) => new URL(c).host).join(' '),
    ...(answered.length ? { outcome: 'ok', detail: `${answered.length} of ${OTS_CALENDARS.length} calendars answered` } : { outcome: 'unreachable', detail: 'no calendar answered' }),
  });
  if (!answered.length) return { note: 'Not timestamped: no calendar answered' };
  return {
    timestamps: {
      calendars: answered, at: new Date(host.now()).toISOString(),
      proofs: Object.fromEntries(files.map((f, i) => [f.name, bytesToBase64(detachedProof(hashes[i], leaves[i]))])),
    },
  };
}

/** No tab to picture: said to the person in Uplink's words, apart from the browser's own refusals. */
class NoPage extends Error {}

/** "Capture as evidence" (W8): the tab's picture, HTML and text, kept until Starcom takes them; or why not. */
async function captureEvidence(host: UplinkHost, tab: { id?: number; windowId?: number; url?: string } | undefined) {
  const { m } = await wordsNow();
  let outcome: { refused: string } | { sent: string };
  let target = tab?.url;
  /** The browser's own words when it would not let a page be read: for the activity log, not the person's eyes. */
  let browserSaid: string | undefined;
  try {
    if (tab?.id === undefined || tab.windowId === undefined) throw new NoPage();
    const picture = await scaledPicture(await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' }));
    const [run] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    const page = run?.result as PageRead | undefined;
    if (!page) throw new Error('Uplink could not read this page');
    target = page.url;
    const made = await evidenceFromPage(page, picture, host.now(), crypto.randomUUID(), sha256Hex);
    if ('refused' in made) outcome = made;
    else {
      // Timestamped before it is kept, so Starcom takes it in whole (W8c).
      const stamped = (await timestampsAllowed(host))
        ? await timestampEvidence(host, made.capture)
        : { note: 'Not timestamped: the timestamp calendars are not allowed, in Uplink\'s options' };
      if ('timestamps' in stamped) made.capture.timestamps = stamped.timestamps;
      else made.capture.timestampNote = stamped.note;
      outcome = await oneAtATime(async () => {
        const next = queueWith(await readStored<Capture[]>(CAPTURES_KEY, []), made.capture);
        if ('refused' in next) return next;
        // The files first, so a Starcom page told of the capture finds them.
        await browser.storage.local.set(Object.fromEntries(
          Object.entries(made.files).map(([name, bytes]) => [fileKey(made.capture.id, name), bytesToBase64(bytes)]),
        ));
        await browser.storage.local.set({ [CAPTURES_KEY]: next.queue });
        return { sent: made.capture.timestamps ? 'evidence' : 'evidence, not timestamped' };
      });
    }
  } catch (error) {
    // Pages the browser keeps to itself (its store, its settings) cannot be pictured or read.
    outcome = { refused: error instanceof NoPage ? m.sent.noPageCapture : m.sent.unreadable };
    if (!(error instanceof NoPage)) browserSaid = error instanceof Error ? error.message : String(error);
  }
  await host.appendActivity({
    at: host.now(), capability: 'capture', purpose: m.sent.evidence,
    ...(target ? { target } : {}),
    ...('refused' in outcome ? { outcome: 'refused', detail: browserSaid ? `${outcome.refused} (the browser said: ${browserSaid})` : outcome.refused } : { outcome: 'ok' }),
  });
  if ('refused' in outcome) await tellRefused(outcome.refused);
  return outcome;
}

export default defineBackground(() => {
  const host = makeHost();
  void showWaiting();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[CAPTURES_KEY] || changes[INBOX_KEY])) void showWaiting();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === SEND) void send(host, info, tab);
    if (info.menuItemId === EVIDENCE) void captureEvidence(host, tab);
  });
  browser.runtime.onInstalled.addListener(async () => {
    // On web pages only: the browser's own pages and the person's files are never captured.
    await browser.contextMenus.removeAll();
    const { m } = await wordsNow();
    browser.contextMenus.create({
      id: SEND, title: m.menu.send, contexts: ['selection', 'link', 'image', 'page'],
      documentUrlPatterns: ['https://*/*', 'http://*/*'],
    });
    browser.contextMenus.create({
      id: EVIDENCE, title: m.menu.evidence, contexts: ['page'],
      documentUrlPatterns: ['https://*/*', 'http://*/*'],
    });
    // The browser runs the bridge only on pages loaded after install: add it to Starcom tabs already open.
    const tabs = await browser.tabs.query({ url: bridgePages(import.meta.env.MODE) }).catch(() => []);
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/starcom-bridge.js'] }).catch(() => undefined);
    }
  });
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const m = message as { via?: string; body?: unknown; id?: string; granted?: boolean };
    // The popup's "Send this page to Starcom": the tab it was opened on, which its opening let Uplink read.
    if (m.via === 'popup' && sender.url?.startsWith(browser.runtime.getURL('/'))) {
      return browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
        if (!tab) return { refused: (await wordsNow()).m.sent.noPage };
        if ((m as { action?: string }).action === 'capture-evidence') return captureEvidence(host, tab);
        return send(host, { pageUrl: tab.url }, tab);
      });
    }
    // Uplink's key and signing windows answering (E3): its own pages alone.
    if ((m.via === 'key' || m.via === 'sign') && sender.url?.startsWith(browser.runtime.getURL('/')) && typeof m.id === 'string') {
      awaitingAnswer.get(m.id)?.((m as { answer?: unknown }).answer ?? null);
      awaitingAnswer.delete(m.id);
      return undefined;
    }
    // The grant window answering: one of Uplink's own pages.
    if (m.via === 'grant' && sender.url?.startsWith(browser.runtime.getURL('/')) && typeof m.id === 'string') {
      awaitingGrant.get(m.id)?.(m.granted ? 'granted' : 'declined');
      awaitingGrant.delete(m.id);
      return undefined;
    }
    // The bridge on Starcom's page: its sender's page is checked again in the handlers.
    if (m.via === 'bridge' && sender.id === browser.runtime.id) {
      return handleToUplink(m.body, starcomSenderUrl({ url: sender.url, tabUrl: sender.tab?.url }, browser.runtime.getURL('/')), host);
    }
    return undefined;
  });
});
