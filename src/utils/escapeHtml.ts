/**
 * Text as HTML that shows it as written: for a string a library sets as HTML, as
 * react-globe.gl sets its labels (float-tooltip's `html`), when the string quotes
 * what someone else wrote.
 */
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
