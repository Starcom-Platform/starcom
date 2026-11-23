/**
 * A capture as Starcom keeps it (decision D-EX, E2, W5): what the person sent from their browser
 * through Uplink becomes an intel item, the raw material a case links and a report cites.
 *
 * It says what was captured, from which page, and when, in UTC. It is graded as an unassessed page
 * (F: an unassessed page cannot be graded), never marked verified, and carries no distribution, so it
 * goes nowhere until someone decides (plan items 0.4, 0.5). The page's words are kept as themselves:
 * every markdown mark in them is escaped, so nothing captured renders as formatting or markup.
 */
import type { CreateIntelItemInput, IntelItemUI } from '../types/intel/IntelItemUI';
import type { CreateIntelReportInput } from '../types/intel/IntelReportUI';
import { formatUtcDateTime } from '../utils/utcTime';
import type { Capture } from './protocol';

/** The tag every capture's item carries. */
export const CAPTURE_TAG = 'capture';
/** The category every capture's item carries: where it came from. */
export const CAPTURE_CATEGORY = 'uplink-capture';
/** A title's length at most. */
const TITLE = 80;

const hostOf = (url: string) => {
  try { return new URL(url).host; } catch { return url; }
};
/** An address as a reader names it: its site and path, no scheme or query. */
const shortAddress = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname === '/' ? '' : pathname}`;
  } catch {
    return url;
  }
};
const clipped = (words: string) => (words.length > TITLE ? `${words.slice(0, TITLE - 1)}…` : words);

/**
 * Text that reads as itself in markdown: every mark escaped, and ':' and '@' too, so an address or an
 * email in the page's words is not made into a link (GitHub-flavoured markdown links bare ones).
 */
export const literal = (text: string) => text.replace(/[\\`*_{}[\]()#+\-.!|<>~&:@]/g, '\\$&');

export function captureTitle(c: Capture): string {
  if (c.kind === 'selection' && c.text) return clipped(c.text.replace(/\s+/g, ' ').trim());
  if (c.kind === 'link' && c.link) return clipped(`Link: ${shortAddress(c.link)}`);
  if (c.kind === 'image') return clipped(`Image from ${c.page.title ?? shortAddress(c.page.url)}`);
  return clipped(c.page.title ?? shortAddress(c.page.url));
}

/** What the item says: the words quoted, the link or image, and where and when they were captured. */
export function captureContent(c: Capture): string {
  const parts: string[] = [];
  if (c.text) parts.push(c.text.split('\n').map((line) => `> ${literal(line)}`).join('\n'));
  if (c.link) parts.push(`Link: <${c.link}>`);
  if (c.image) parts.push(`Image: <${c.image}>`);
  const from = c.page.title ? `[${literal(c.page.title)}](<${c.page.url}>)` : `<${c.page.url}>`;
  parts.push(`Captured from ${from} on ${formatUtcDateTime(Date.parse(c.at), { year: true })}, through Starcom Uplink.`);
  if (c.cut) parts.push('The selection was longer than Uplink keeps whole, and was cut.');
  return parts.join('\n\n');
}

/**
 * The words a capture holds, as captured, for reading or translating (D-ML): a selection's text, taken back
 * out of the quote captureContent wrote it in, or a page's own title. None for a link or an image: their
 * titles are Starcom's words about them, not the page's.
 */
export function capturedWords(item: Pick<IntelItemUI, 'tags' | 'title' | 'content'>): string | null {
  const kind = item.tags[1];
  if (kind === 'selection') {
    const quote = item.content.split('\n\n')[0];
    if (!quote.startsWith('>')) return null;
    return quote.split('\n').map((line) => line.replace(/^> ?/, '').replace(/\\(.)/g, '$1')).join('\n');
  }
  if (kind === 'page' || kind === 'evidence') return item.title;
  return null;
}

export function captureToItem(c: Capture): CreateIntelItemInput {
  return {
    title: captureTitle(c),
    type: 'CAPTURE',
    source: hostOf(c.page.url),
    // Admiralty grades the source, and an unassessed page cannot be graded.
    reliability: 'F',
    // Verbatim, as the browser gave it: that the page said this is checked; whether it is so is not.
    confidence: 0.9,
    tags: [CAPTURE_TAG, c.kind],
    categories: [CAPTURE_CATEGORY],
    content: captureContent(c),
    // When it was captured, not when Starcom took it in: it may have waited.
    collectedAt: c.at,
    verified: false,
  };
}

/** What can hold a capture: a case, as evidence or against it, or a report citing it. */
export interface CaptureHolder {
  relatedEntities?: readonly string[];
  contradictedBy?: readonly string[];
  sourceIntelIds?: readonly string[];
}

/** The captures nothing holds yet: the inbox (EX16). */
export function unfiledCaptures<I extends Pick<IntelItemUI, 'id' | 'tags' | 'categories'>>(
  items: readonly I[],
  holders: readonly CaptureHolder[],
): I[] {
  const filed = new Set(holders.flatMap((h) => [...(h.relatedEntities ?? []), ...(h.contradictedBy ?? []), ...(h.sourceIntelIds ?? [])]));
  return items.filter((i) => i.tags.includes(CAPTURE_TAG) && i.categories.includes(CAPTURE_CATEGORY) && !filed.has(i.id));
}

/** A report drafted from a capture: citing it, quoting it, deciding nothing about who may read it. */
export function reportDraftFrom(item: Pick<IntelItemUI, 'id' | 'title' | 'content'>): CreateIntelReportInput {
  return { title: item.title, content: item.content, category: 'GENERAL', tags: [CAPTURE_TAG], sourceIntelIds: [item.id], status: 'DRAFT' };
}
