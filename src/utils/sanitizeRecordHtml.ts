/**
 * A record's text as HTML, kept to what reads as text (found 2026-10-11, before captures from any web
 * page reached the vault, decision D-EX, E2).
 *
 * IntelWeb shows a record's markdown through `marked`, which passes raw HTML through, and the
 * renderer's sanitizer returned the HTML untouched into dangerouslySetInnerHTML. A record's text comes
 * from people and pages Starcom does not control: relays, bundles, and now any page someone captures.
 * The site's CSP stops scripts; it does not stop a fake link, a form asking for a password, an overlay
 * over the app, or a remote image that tells whoever serves it the reader's address and when they read.
 *
 * So: an allowlist. Elements that read as text are kept, with the few attributes they need; what runs,
 * loads, asks or styles is removed with everything inside it; anything else is unwrapped, keeping its
 * words. A link is kept only to the web, mail, or a place on the page, and never reaches back.
 */

/** Elements kept: what reads as text. */
const KEEP = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
  'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'span', 'div', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'sup', 'sub', 'kbd', 'mark', 'small', 'abbr',
]);

/** Removed with everything inside: what runs, loads, asks, or styles the page. */
const DROP = new Set([
  'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript',
  'svg', 'math', 'img', 'picture', 'source', 'video', 'audio', 'track', 'canvas', 'map', 'area', 'link',
  'meta', 'base', 'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'dialog',
]);

/** The attributes each kept element may carry; every other attribute goes. */
const ATTRIBUTES: Record<string, readonly string[]> = {
  a: ['href', 'class', 'data-entity', 'title'],
  span: ['class', 'data-tag'],
  code: ['class'],
  pre: ['class'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  ol: ['start'],
  abbr: ['title'],
};

/** The renderer's own classes, and a code block's language; no class can dress text as the app's controls. */
const KEPT_CLASS = /^(wikilink|entity-link|hashtag|tag|language-[\w-]+)$/;

const linkAllowed = (href: string) => href.startsWith('#') || /^(https?:|mailto:)/i.test(href.trim());

function clean(parent: Node): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === 3) continue; // text
    if (child.nodeType !== 1) { child.parentNode?.removeChild(child); continue; } // comments and the rest
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) { el.remove(); continue; }
    clean(el);
    if (!KEEP.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    const allowed = ATTRIBUTES[tag] ?? [];
    for (const { name } of [...el.attributes]) {
      if (!allowed.includes(name)) el.removeAttribute(name);
    }
    const classes = el.getAttribute('class');
    if (classes !== null) {
      const kept = classes.split(/\s+/).filter((c) => KEPT_CLASS.test(c));
      if (kept.length) el.setAttribute('class', kept.join(' '));
      else el.removeAttribute('class');
    }
    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href !== null && !linkAllowed(href)) el.removeAttribute('href');
      else if (href !== null && !href.startsWith('#')) el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  }
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML kept to what reads as text. Parsed inert: nothing in it runs or loads while it is cleaned. */
export function sanitizeRecordHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return escapeText(html);
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}
