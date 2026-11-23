/**
 * A title cut near `chars`, at a word where one is near, with an ellipsis: for a
 * line on a card or a row, where a whole headline does not fit. Kept whole when it
 * fits; trailing punctuation goes before the ellipsis.
 */
export function cutTitle(title: string, chars = 60): string {
  if (title.length <= chars) return title;
  const head = title.slice(0, chars + 1);
  const word = head.lastIndexOf(' ');
  return `${(word > chars / 2 ? head.slice(0, word) : head.slice(0, chars)).replace(/[\s,;:.–-]+$/, '')}…`;
}
