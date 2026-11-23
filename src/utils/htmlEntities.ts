/**
 * Text a source sends with HTML's character references in it, as plain text: Grants.gov's titles carry
 * `&ndash;`, `&rsquo;`, `&amp;`, `&nbsp;` and a numeric zero-width space (2026-10-13). React shows text as given,
 * so a title would read "Award &ndash; Rare Melanomas". Numeric references are decoded whole; named ones
 * from the list below (a no-break space read as a space), and any other is left as it stands.
 */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
};

// Zero-width and bidirectional marks carry nothing to read and can hide text.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
      if (ref[0] !== '#') return NAMED[ref.toLowerCase()] ?? whole;
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    .replace(INVISIBLE, '');
}
