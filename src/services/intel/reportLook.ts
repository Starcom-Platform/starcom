/**
 * How Intel Report glyphs look (decisions BA14, BA15; plan block J, item 5).
 *
 * A glyph wears its report's category as an emblem, inside a page that keeps its
 * colour for the assessment. People see it unless they turn it off in the Intel
 * Reports settings; the share handle sets the look for its own page only, never
 * saved, so an agent never changes a person's setting (as the cap, BA7).
 */

export interface ReportLook {
  /** Whether each glyph wears its category's emblem. */
  emblems: boolean;
}

/**
 * The person's choice: on unless they turned it off. A setting saved before
 * there was a choice has no field, and reads as on (BA15) without a migration.
 */
export function emblemsChosen(setting: { categoryEmblems?: boolean }): boolean {
  return setting.categoryEmblems !== false;
}

/** A look as asked for through the handle, or why it is refused. */
export function readReportLook(value: unknown): ReportLook | { refused: string } {
  const refused = { refused: `A report look is { emblems: true | false }; got ${JSON.stringify(value) ?? String(value)}.` };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refused;
  const keys = Object.keys(value);
  const { emblems } = value as { emblems?: unknown };
  return keys.length === 1 && typeof emblems === 'boolean' ? { emblems } : refused;
}

let override: ReportLook | undefined;
const listeners = new Set<() => void>();

/** The page's look, set by the handle; undefined clears it. Never saved. */
export function setReportLookOverride(look: ReportLook | undefined): void {
  override = look ? { ...look } : undefined;
  listeners.forEach((listener) => listener());
}

export function getReportLookOverride(): ReportLook | undefined {
  return override;
}

export function subscribeReportLook(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The look in force: the handle's for this page when set, else the person's. */
export function effectiveReportLook(setting: ReportLook): ReportLook & { from: 'handle' | 'setting' } {
  return override ? { ...override, from: 'handle' } : { ...setting, from: 'setting' };
}
