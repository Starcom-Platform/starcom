/**
 * What an Intel Report says it is about (BA13; plan block J, item 5): its stated
 * top-level `category:` word, and the icon drawn for it inside its glyph (BA14).
 *
 * The publisher's own word, as they wrote it: Mecha Jono's notes use a two-level
 * vocabulary, `category:conflict` with `category:conflict.wars` beside it, and
 * the top level is the kind. A report stating none has no category, and its
 * glyph is drawn as it always was.
 */
import { GENERIC_CATEGORY_SYMBOL, INTEL_CATEGORY_SYMBOLS, type IntelCategory, type SymbolEntry } from '../../symbols/symbolRegistry';

const PREFIX = 'category:';

/** The first stated category's top-level word, lowercased, or null when none is stated. */
export function reportCategoryOf(tags: readonly string[] | undefined): string | null {
  for (const tag of tags ?? []) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed.startsWith(PREFIX)) continue;
    const word = trimmed.slice(PREFIX.length).trim().split('.')[0].trim();
    if (word) return word;
  }
  return null;
}

/** Its icon: its own, the generic one for a word not yet given one, none for no category. */
export function categorySymbolOf(category: string | null): SymbolEntry | null {
  if (category === null) return null;
  return Object.prototype.hasOwnProperty.call(INTEL_CATEGORY_SYMBOLS, category)
    ? INTEL_CATEGORY_SYMBOLS[category as IntelCategory]
    : GENERIC_CATEGORY_SYMBOL;
}
