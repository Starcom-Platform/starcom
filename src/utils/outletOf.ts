/**
 * The site an article is on, without the www., m. or amp. a site serves the same story under; a
 * citation as GDELT gives it, where it has one instead of a link (its codebook names BBC Monitoring).
 */
export function outletOf(source: string): string | null {
  const text = source.trim();
  if (!text) return null;
  try {
    const host = new URL(text).hostname.toLowerCase();
    return host.replace(/^(?:www\d*|m|amp|mobile)\./, '') || null;
  } catch {
    return text;
  }
}
