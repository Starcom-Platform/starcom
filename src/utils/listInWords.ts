/** "Ohio", "Palestine and Israel", "Chad, Sudan and Libya": a list as a sentence says it. */
export function listInWords(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
