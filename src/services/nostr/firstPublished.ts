/**
 * When a note was first published, which is not always when it was signed (Mecha Jono's key change, 2 Nov 2026;
 * decision MX30). At the cut-over Mecha Jono re-signs its standing notes under its new key, each byte for byte but for
 * its id, key, signature and `created_at`, plus a tag `["carried", <old event id>, <old created_at>]`. Placed by when
 * they were signed, about three thousand notes would all sit at the carry, and a newest-first list would follow the
 * order they were sent in.
 *
 * So a note's time is its `published_at`, else the carried tag's old `created_at`, else when it was signed: whole unix
 * seconds each, a value that is not one passed over.
 */

/** Whole unix seconds from a tag's value, or null. */
const seconds = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n > 0 && Number.isSafeInteger(n) ? n : null;
};

/** When it was first published, unix seconds: `published_at`, else the carried tag's old `created_at`, else when it was signed. */
export function firstPublishedAt(event: { created_at: number; tags?: unknown }): number {
  const tags = Array.isArray(event.tags) ? (event.tags as unknown[]).filter(Array.isArray) as unknown[][] : [];
  const published = seconds(tags.find((t) => t[0] === 'published_at')?.[1]);
  if (published !== null) return published;
  const carried = seconds(tags.find((t) => t[0] === 'carried')?.[2]);
  return carried ?? event.created_at;
}
