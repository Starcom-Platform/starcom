/**
 * Mecha Jono's grant notices, for the Market Exchange's Grants tab (decision D-MF, MF5): grants are not missions.
 * A notice is a received package of the grant family, open and Public (MF6), as its mission line, its steps and
 * the closing date its operation states. It carries no Grants.gov opportunity number, so it meets its window by
 * title; a title cut short ("…") meets the one window that begins with it.
 */
import type { AcceptedPackage } from '../intel/MissionPackageIngest';
import { isGrantNotice, missionCardOf } from '../intel/received/missionCard';
import type { FundingWindow } from './feeds/grantsGov';

export interface GrantNotice {
  /** Its address, as a mission card keys it. */
  key: string;
  title: string;
  /** When it closes, YYYY-MM-DD, as its operation states it. */
  closes?: string;
  /** What it asks of people, its mission line. */
  mission: string;
  steps: string[];
  signer: string;
}

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : undefined);

function closesOf(pkg: AcceptedPackage): string | undefined {
  const clock = asShape(asShape(asShape(pkg.check.manifest?.metadata)?.mechaJono)?.operation)?.clock;
  const entry = Array.isArray(clock) ? clock.map(asShape).find((c) => c?.what === 'closes') : undefined;
  return typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : undefined;
}

/** The open, Public grant notices among what was received. */
export function grantNoticesFrom(accepted: readonly AcceptedPackage[]): GrantNotice[] {
  return accepted
    .filter((pkg) => pkg.check.manifest?.visibility === 'public' && isGrantNotice(pkg))
    .map((pkg) => ({ pkg, card: missionCardOf(pkg) }))
    .filter(({ card }) => card.open)
    .map(({ pkg, card }) => {
      const closes = closesOf(pkg);
      return {
        key: card.key, title: card.subject ?? card.headline, mission: card.headline, steps: card.steps, signer: pkg.event.pubkey,
        ...(closes ? { closes } : {}),
      };
    });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CUT = /(?:…|\.\.\.)\s*$/;
/** A prefix shorter than this would meet too many windows to mean one. */
const PREFIX_MIN = 24;

/** Each notice on the window of its title; the rest, unmatched. */
export function matchNotices(windows: readonly FundingWindow[], notices: readonly GrantNotice[]): { byWindow: Map<string, GrantNotice>; unmatched: GrantNotice[] } {
  const byWindow = new Map<string, GrantNotice>();
  const unmatched: GrantNotice[] = [];
  const titled = windows.map((w) => ({ w, title: norm(w.title) }));
  for (const notice of notices) {
    const cut = CUT.test(notice.title);
    const wanted = norm(notice.title.replace(CUT, ''));
    const found = cut
      ? (wanted.length >= PREFIX_MIN ? titled.filter((t) => t.title.startsWith(wanted)) : [])
      : titled.filter((t) => t.title === wanted);
    if (found.length === 1 && !byWindow.has(found[0].w.id)) byWindow.set(found[0].w.id, notice);
    else unmatched.push(notice);
  }
  return { byWindow, unmatched };
}
