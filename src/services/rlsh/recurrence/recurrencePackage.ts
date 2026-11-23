/**
 * A field package with a window (decision D-RR; kit 4): `celebration_safety`, a field mission in the envelope every
 * field package uses, with `metadata.mechaJono.window` (the night's window, its phases and its note) and, once a Case
 * is published, `metadata.mechaJono.case`. Read here for the mission card's field variant (kit 5.4).
 */
import type { PackageManifest, ObjectiveAsk } from '../../exchange/types';
import { readWindow, type EventWindow } from '../../psiWatch/windowProfile';

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : undefined);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const secondsOf = (iso: unknown): number | null => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

export type Phase = 'before' | 'night' | 'after';
export const PHASES: readonly Phase[] = ['before', 'night', 'after'];

export interface PackageWindow {
  window: EventWindow;
  /** The window's state when the package was sent; the state now is the window note's, else the clock's. */
  state: string | null;
  tzid: string;
  anchorBasis: string | null;
  /** The window note's address. */
  note: string | null;
  phases: Record<Phase, string[]>;
}

/** The package's window, or null for a field package without one. */
export function packageWindowOf(manifest: PackageManifest | undefined): PackageWindow | null {
  const w = asShape(asShape(asShape(manifest?.metadata)?.mechaJono)?.window);
  if (!w) return null;
  const [from, peak, until, anchor] = [secondsOf(w.from), secondsOf(w.peak), secondsOf(w.until), secondsOf(w.anchor)];
  if (from === null || peak === null || until === null) return null;
  const p = asShape(w.profile);
  const profile = p?.kind === 'rise_halflife' ? ['profile', 'rise_halflife', String(p.leadMin), String(p.peakMin), String(p.halfLifeMin), String(p.endMin)] : null;
  const window = readWindow([['window', String(from), String(peak), String(until)], ...(profile ? [profile] : []), ...(anchor !== null ? [['anchor', String(anchor)]] : [])]);
  if (!window) return null;
  const phases = asShape(w.phases);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    window,
    state: text(w.state),
    tzid: text(w.tzid) ?? 'UTC',
    anchorBasis: text(w.anchorBasis),
    note: text(w.note),
    phases: { before: list(phases?.before), night: list(phases?.night), after: list(phases?.after) },
  };
}

/** The Case the package names, once one is published (kit 4.2). */
export function packageCaseOf(manifest: PackageManifest | undefined): { address: string; title: string } | null {
  const c = asShape(asShape(asShape(manifest?.metadata)?.mechaJono)?.case);
  const address = text(c?.address);
  return address ? { address, title: text(c?.title) ?? '' } : null;
}

/** Why an ended package closed, as it says it. */
export const endReasonOf = (manifest: PackageManifest | undefined): string | null =>
  text(asShape(asShape(manifest?.metadata)?.mechaJono)?.endReason);

/** Each objective's code, as the operator's format writes it: its tier's letter and its place among them (P1, S2, T1). */
export function objectiveCodes(objectives: readonly ObjectiveAsk[]): Map<string, string> {
  const letter: Record<string, string> = { primary: 'P', secondary: 'S', tertiary: 'T' };
  const seen: Record<string, number> = {};
  const codes = new Map<string, string>();
  for (const o of objectives) {
    const tier = (o as ObjectiveAsk & { tier?: string }).tier;
    const l = tier ? letter[tier] : undefined;
    if (!l) continue;
    seen[l] = (seen[l] ?? 0) + 1;
    codes.set(o.id, `${l}${seen[l]}`);
  }
  return codes;
}

/** The topics to look up for one's own place (kit 4.3), on the open package only. */
export const CHECK_TOPICS = ['mask_laws', 'recording_consent', 'citizens_arrest', 'volunteer_immunity'] as const;
export type CheckTopic = (typeof CHECK_TOPICS)[number];
export const checksOf = (tags: readonly string[][]): CheckTopic[] =>
  tags.filter((t) => t[0] === 'check' && (CHECK_TOPICS as readonly string[]).includes(t[1])).map((t) => t[1] as CheckTopic);

/** Whether a received package is one with a window: the field variant's card is drawn for it. */
export const hasPackageWindow = (manifest: PackageManifest | undefined): boolean => packageWindowOf(manifest) !== null;
