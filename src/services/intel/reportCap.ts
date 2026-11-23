/**
 * The report cap (decisions BA4–BA7; plan block J, item 2): how many Intel
 * Reports the globe draws.
 *
 * It was 50, fixed, with no control, and the share handle listed what was
 * drawn without saying the rest existed: Mecha Jono's daily briefing found
 * 47–50 reports of the 128 they published that day, whatever window was set.
 * Machines differ, and so do people: some want more, some all of them.
 *
 *   - People choose 50, 100, 250, 500, Max (1,000), Unlimited, or a number of
 *     their own from 10 (BA5), in the "Showing N of M" notice and the layer's
 *     settings (BA4), and keep what they choose; 50 to start (BA7).
 *   - The share handle sets a cap for its page only, never saved, so an agent
 *     never changes a person's setting (BA7): the override here.
 *   - Reading follows the cap (BA6): the ingest holds at least the 200 it always
 *     has, more when the cap asks, everything of its window when unlimited.
 *
 * A cap is a whole number, or null for Unlimited, as the setting stores it.
 */

/** The steps offered (BA5), before Max, Unlimited and a number of one's own. */
export const REPORT_CAP_STEPS = [50, 100, 250, 500] as const;
/** Max: the largest step, for a machine that can take it. */
export const REPORT_CAP_MAX = 1000;
/** The least a cap of one's own may be. */
export const REPORT_CAP_MIN = 10;
/** Where people start (BA7). */
export const DEFAULT_REPORT_CAP = 50;
/** What the ingest always holds, whatever the cap: what it held before there was a choice. */
export const INGEST_HOLD_FLOOR = 200;

/** A cap as asked for: a number, 'max' or 'unlimited'. Null for Unlimited, or why it is refused. */
export function readReportCap(value: unknown): number | null | { refused: string } {
  if (value === 'max') return REPORT_CAP_MAX;
  if (value === 'unlimited') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= REPORT_CAP_MIN) return value;
  return { refused: `A report cap is a whole number from ${REPORT_CAP_MIN}, 'max' or 'unlimited'; got ${JSON.stringify(value) ?? String(value)}.` };
}

/** Whether a cap read was refused. */
export const isCapRefusal = (read: number | null | { refused: string }): read is { refused: string } =>
  read !== null && typeof read === 'object';

/** How many reports a cap draws. */
export const drawLimit = (cap: number | null): number => (cap === null ? Infinity : cap);

/** How many reports the ingest holds for a cap (BA6). */
export const holdFor = (cap: number | null): number => (cap === null ? Infinity : Math.max(INGEST_HOLD_FLOOR, cap));

/** A cap as a person reads it. */
export function capLabel(cap: number | null): string {
  if (cap === null) return 'Unlimited';
  // Thousands marked with a comma, directly: toLocaleString is the shared time formatter's alone.
  const number = String(cap).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cap === REPORT_CAP_MAX ? `Max (${number})` : number;
}

// ── The handle's cap for a page (BA7) ─────────────────────────────────────────

let override: { cap: number | null } | undefined;
const listeners = new Set<() => void>();

/** The page's cap, set by the handle; undefined clears it. Never saved. */
export function setReportCapOverride(cap: number | 'unlimited' | undefined): void {
  override = cap === undefined ? undefined : { cap: cap === 'unlimited' ? null : cap };
  listeners.forEach((listener) => listener());
}

export function getReportCapOverride(): { cap: number | null } | undefined {
  return override;
}

export function subscribeReportCap(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The cap in force: the handle's for this page when set, else the person's. */
export function effectiveReportCap(setting: number | null): { cap: number | null; from: 'handle' | 'setting' } {
  return override ? { cap: override.cap, from: 'handle' } : { cap: setting, from: 'setting' };
}
