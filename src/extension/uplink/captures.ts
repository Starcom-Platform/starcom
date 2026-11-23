/**
 * What the person sends to Starcom while browsing, as Uplink keeps it until Starcom takes it into
 * their cases (decision D-EX, E2; EX14, EX16). Pure: the background hands in what the browser said of
 * the click, and keeps the queue in the browser's storage.
 *
 * A capture comes from a web page, never the browser's own pages or the person's files. Nothing is
 * dropped: when the queue is full a new capture is refused, and the person is told, so what they sent
 * before is never lost to make room.
 */
import { interpolate } from '../../i18n/messages';
import { uplinkEn, type UplinkMessages } from '../../i18n/uplink/en';
import type { Capture } from '../protocol';

/** What the browser says of a right-click on "Send to Starcom". */
export interface ClickInfo {
  selectionText?: string;
  linkUrl?: string;
  srcUrl?: string;
  mediaType?: string;
  pageUrl?: string;
}

/** The tab clicked in, as far as the browser says. */
export interface TabInfo {
  url?: string;
  title?: string;
}

/** Where Uplink keeps the captures waiting for Starcom: the background writes it, the bridge watches it. */
export const CAPTURES_KEY = 'captures';
/** Where Uplink keeps how many captures wait to be filed in Starcom, as Starcom last said (W7). */
export const INBOX_KEY = 'inbox';

/** The longest selection kept whole; a longer one is cut, and says so. */
export const SELECTION_KEPT = 50_000;
/** How many captures wait for Starcom at most. Past this a capture is refused; none is dropped. */
export const CAPTURES_WAITING = 500;

const NOT_THE_WEB = 'Uplink captures from web pages, not the browser\'s own pages or your files';
const IMAGE_IN_PAGE = 'This image is held inside the page; capture the page as evidence to keep it';

/** An address on the web: http or https. */
const onTheWeb = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/** A capture from a right-click, or why there is none. A selection wins over an image, an image over a link. */
export function captureFromClick(info: ClickInfo, tab: TabInfo | undefined, at: number, id: string): { capture: Capture } | { refused: string } {
  const pageUrl = info.pageUrl ?? tab?.url;
  if (!onTheWeb(pageUrl)) return { refused: NOT_THE_WEB };
  const isImage = info.mediaType === 'image' && Boolean(info.srcUrl);
  if (isImage && !onTheWeb(info.srcUrl) && !info.selectionText) return { refused: IMAGE_IN_PAGE };

  const page: Capture['page'] = { url: pageUrl };
  // The tab's title names the page only when the tab is that page.
  if (tab?.title && tab.url === pageUrl) page.title = tab.title;
  const capture: Capture = { id, kind: 'page', at: new Date(at).toISOString(), page };

  const text = info.selectionText?.trim();
  if (onTheWeb(info.linkUrl)) capture.link = info.linkUrl;
  if (isImage && onTheWeb(info.srcUrl)) capture.image = info.srcUrl;
  if (text) {
    capture.kind = 'selection';
    capture.text = text.length > SELECTION_KEPT ? text.slice(0, SELECTION_KEPT) : text;
    if (text.length > SELECTION_KEPT) capture.cut = true;
  } else if (capture.image) capture.kind = 'image';
  else if (capture.link) capture.kind = 'link';
  return { capture };
}

/** The queue with one more capture, or why it cannot take one. */
export function queueWith(queue: readonly Capture[], capture: Capture): { queue: Capture[] } | { refused: string } {
  if (queue.length >= CAPTURES_WAITING) return { refused: `${CAPTURES_WAITING} captures are waiting for Starcom; open Starcom to take them in` };
  return { queue: [...queue, capture] };
}

/** The queue without the captures Starcom says it kept, and how many went. */
export function keptOut(queue: readonly Capture[], ids: readonly string[]): { queue: Capture[]; released: number } {
  const kept = new Set(ids);
  const left = queue.filter((c) => !kept.has(c.id));
  return { queue: left, released: queue.length - left.length };
}

/** What kind of thing was sent: a selection, an image, a link or a page (its words are in Uplink's catalogue). */
export function sentKind(info: ClickInfo): keyof UplinkMessages['sent']['what'] {
  if (info.selectionText?.trim()) return 'selection';
  if (info.mediaType === 'image' && info.srcUrl) return 'image';
  if (info.linkUrl) return 'link';
  return 'page';
}

/** What was sent, in English words, as Uplink answers its own popup. */
export const whatWasSent = (info: ClickInfo): string =>
  ({ selection: 'a selection', image: 'an image', link: 'a link', page: 'a page' })[sentKind(info)];

/**
 * The toolbar icon (W7): every capture not yet filed, those waiting for Starcom to open and those in
 * Starcom's inbox, as one count, with what it is made of in its title.
 */
export function badgeFor(waitingForStarcom: number, inStarcomInbox: number, words: UplinkMessages['icon'] = uplinkEn.icon): { text: string; title: string } {
  const toFile = waitingForStarcom + inStarcomInbox;
  if (toFile === 0) return { text: '', title: 'Starcom Uplink' };
  const title = waitingForStarcom > 0
    ? interpolate(words.toFileWaiting, { n: toFile, waiting: waitingForStarcom })
    : interpolate(words.toFile, { n: toFile });
  return { text: toFile > 999 ? '999+' : String(toFile), title };
}

