/**
 * The work that cites a cause or an initiative (decision D-RS, RS1, RS3; the owner's RS53–RS54, 2026-10-18): each
 * roster item whose `toward` link names it, and each Mission Package whose does (RS59, 2026-10-23), how many
 * publishers they come from, and of which kinds. People are never counted or listed, only the work they posted.
 */
import { ROSTER_KIND_NAME, ROSTER_KINDS, type ReadRosterItem, type RosterKind } from './rosterItem';
import { towardOfPackage } from './packageToward';
import type { AcceptedPackage } from '../intel/MissionPackageIngest';

export interface CitingWork {
  items: ReadRosterItem[];
  /** The Mission Packages toward it (RS59), newest first. */
  missions: AcceptedPackage[];
  publishers: number;
  byKind: Array<{ kind: RosterKind; n: number }>;
}

/** Each item and each package toward `address`, newest first, from everyone read. */
export function citingWork(address: string, all: readonly ReadRosterItem[], packages: readonly AcceptedPackage[] = []): CitingWork {
  const items = all.filter((x) => x.address !== address && x.toward.some((l) => l.coordinate === address))
    .sort((a, b) => b.createdAt - a.createdAt);
  const missions = packages.filter((p) => towardOfPackage(p.event.tags).some((l) => l.coordinate === address))
    .sort((a, b) => b.event.created_at - a.event.created_at);
  const byKind = ROSTER_KINDS.map((kind) => ({ kind, n: items.filter((x) => x.kind === kind).length })).filter((k) => k.n > 0);
  const publishers = new Set([...items.map((x) => x.author), ...missions.map((p) => p.event.pubkey)]).size;
  return { items, missions, publishers, byKind };
}

const PLURAL: Partial<Record<RosterKind, string>> = { story: 'stories', quest_line: 'quest lines' };
const kindCount = ({ kind, n }: { kind: RosterKind; n: number }) =>
  `${n} ${n === 1 ? ROSTER_KIND_NAME[kind].toLowerCase() : PLURAL[kind] ?? `${ROSTER_KIND_NAME[kind].toLowerCase()}s`}`;

/** What a cause or an initiative says of it: `3 pieces of work cite it, from 2 publishers: 1 campaign, 2 stories.` */
export function citingWorkText(work: CitingWork, verb: 'cite it' | 'toward it'): string {
  const n = work.items.length + work.missions.length;
  if (n === 0) return verb === 'cite it' ? 'No work cites it yet.' : 'No work toward it yet. Work toward it to join it.';
  const pieces = `${n} ${n === 1 ? 'piece' : 'pieces'} of work`;
  const said = verb === 'cite it' ? `${pieces} ${n === 1 ? 'cites' : 'cite'} it` : `${pieces} toward it`;
  const missions = work.missions.length ? [`${work.missions.length} ${work.missions.length === 1 ? 'mission' : 'missions'}`] : [];
  return `${said}, from ${work.publishers} ${work.publishers === 1 ? 'publisher' : 'publishers'}: ${[...work.byKind.map(kindCount), ...missions].join(', ')}.`;
}
