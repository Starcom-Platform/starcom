/**
 * Where a note's information was published: its `r` tags, read in order (decision D-CT, CT2).
 *
 * Interchange 3.19 (16 October): every note Mecha Jono publishes for Starcom carries its sources
 * as `["r", url]` tags. The first is the original source, the authority's or outlet's own page;
 * the rest follow in order, and the publisher's own pages come last if at all. Up to 20 a note.
 * A Mission Package carries them on its event; a field package's source also sits in its manifest
 * at `metadata.mechaJono.source.link`, read only when the event carries none.
 *
 * Notes come from public relays, so every link is untrusted. A link is kept only when `new URL`
 * reads it and its scheme is http or https: `javascript:`, `data:` and the rest are dropped.
 * Each link once, in the order given, at most MAX_SOURCE_LINKS.
 */

/** The most links a view shows, as the Interchange caps a note's `r` tags. */
const MAX_SOURCE_LINKS = 20;

/** A link that may be offered to a reader: an http or https URL, as `new URL` reads it, or null. */
function safeSourceUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // A URL with no host goes nowhere a reader can follow.
  return url.hostname ? url : null;
}

/** These links, each once, safe ones only, in their order, at most MAX_SOURCE_LINKS. */
export function safeSourceLinks(values: readonly unknown[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (kept.length >= MAX_SOURCE_LINKS) break;
    const url = safeSourceUrl(value);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    kept.push(url.href);
  }
  return kept;
}

/** A note's `r` tags, in tag order: its sources, the original first. Nothing when it names none. */
export function sourceLinksFromTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return safeSourceLinks(tags.filter((t): t is unknown[] => Array.isArray(t) && t[0] === 'r').map((t) => t[1]));
}

/**
 * A Mission Package's sources: its event's `r` tags, or, when it carries none, the source its
 * manifest names at `metadata.mechaJono.source.link` (a field package's, before 3.19).
 */
export function packageSourceLinks(tags: unknown, manifest: unknown): string[] {
  const tagged = sourceLinksFromTags(tags);
  if (tagged.length) return tagged;
  const metadata = (manifest as { metadata?: { mechaJono?: { source?: { link?: unknown } } } } | null | undefined)?.metadata;
  return safeSourceLinks([metadata?.mechaJono?.source?.link]);
}

/** One source as a reader sees it: the link, its host, and whether it is the original. */
export interface SourceLinkItem {
  href: string;
  host: string;
  original: boolean;
}

/**
 * The sources to show, read again as they are drawn: stored copies are untrusted too. The first
 * is the original source.
 */
export function sourceLinkItems(links: readonly unknown[] | undefined): SourceLinkItem[] {
  return safeSourceLinks(links ?? []).map((href, i) => ({
    href,
    host: new URL(href).hostname.replace(/^www\./, ''),
    original: i === 0,
  }));
}
