/**
 * Importing a bundle (plan item 2.4): first what it holds and what would
 * happen to each record, then, when the person says so, exactly that.
 *
 * For each record:
 *   add     this workspace has no copy;
 *   update  the bundle's copy is newer than the one held;
 *   keep    the one held is as new, or newer here.
 *
 * Ids are kept, so the links between records hold; who sent it is recorded
 * on each record added or updated, and the name they gave is learned, ranked
 * below any name a team gave them. A case or mission whose number another
 * record here already has is said to be a different one.
 *
 * What the sender kept Private and left out (plan item 9.13) is shown apart
 * from what may still arrive, and is recorded on the case or mission, so it
 * can say so after the import as well as before.
 */
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { learnName } from '../../identity/names';
import type { BundleLink, BundledType, KeptBack, OpenedBundle, RecordEnvelope } from '../../exchange/bundle';
import type { OpenedCopy } from '../copy/workCopy';

export type ImportAction = 'add' | 'update' | 'keep';

export interface ImportRow {
  type: BundledType;
  id: string;
  title: string;
  number?: string;
  action: ImportAction;
  note?: string;
}

export interface ImportPreview {
  from: string;
  fromName?: string;
  madeAt: string;
  subject: OpenedBundle['subject'];
  rows: ImportRow[];
  absent: BundleLink[];
  /** Records it cites that the sender keeps Private: they will not arrive. */
  withheld: KeptBack[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function titleOf(envelope: RecordEnvelope): string {
  const r = envelope.record;
  return text(r.title) || text((r.frontmatter as Record<string, unknown> | undefined)?.title) || envelope.id;
}

function heldUpdatedAt(envelope: RecordEnvelope): string | null {
  if (envelope.type === 'case') return intelWorkspaceManager.getCase(envelope.id)?.updatedAt ?? null;
  if (envelope.type === 'mission') return intelWorkspaceManager.getMission(envelope.id)?.updatedAt ?? null;
  if (envelope.type === 'report') {
    const held = intelWorkspaceManager.getReports().find((r) => r.id === envelope.id);
    return held ? held.modifiedAt || held.createdAt : null;
  }
  const item = intelWorkspaceManager.getStoredIntelItem(envelope.id);
  return item ? text(item.modifiedAt) || text(item.createdAt) : null;
}

function sameNumberHere(envelope: RecordEnvelope): string | null {
  const number = text(envelope.record.caseNumber) || text(envelope.record.missionNumber);
  if (!number) return null;
  const others = envelope.type === 'case' ? intelWorkspaceManager.getCases() : intelWorkspaceManager.getMissions();
  const other = (others as Array<{ id: string; title: string; caseNumber?: string; missionNumber?: string }>)
    .find((o) => o.id !== envelope.id && (o.caseNumber ?? o.missionNumber) === number);
  return other ? `"${other.title}" here has the same number; they are different ${envelope.type}s.` : null;
}

function rowFor(envelope: RecordEnvelope): ImportRow {
  const number = text(envelope.record.caseNumber) || text(envelope.record.missionNumber) || undefined;
  const base = { type: envelope.type, id: envelope.id, title: titleOf(envelope), ...(number ? { number } : {}) };
  const held = heldUpdatedAt(envelope);
  const clash = sameNumberHere(envelope);
  if (held === null) return { ...base, action: 'add', ...(clash ? { note: clash } : {}) };
  const theirs = Date.parse(envelope.updatedAt);
  const ours = Date.parse(held);
  if (theirs > ours) return { ...base, action: 'update', note: clash ?? 'Their copy is newer than yours.' };
  return { ...base, action: 'keep', note: theirs === ours ? 'The same as yours.' : 'Yours is newer here.' };
}

export function previewImport(bundle: OpenedBundle): ImportPreview {
  return {
    from: bundle.from,
    ...(bundle.fromName ? { fromName: bundle.fromName } : {}),
    madeAt: bundle.madeAt,
    subject: bundle.subject,
    rows: bundle.envelopes.map(rowFor),
    absent: bundle.absent,
    withheld: bundle.withheld ?? [],
  };
}

/** Adds and updates what the preview says, now. Returns how many of each. */
export async function applyImport(bundle: OpenedBundle): Promise<{ added: number; updated: number; kept: number }> {
  await intelWorkspaceManager.ensureInitialized();
  const receivedFrom = { pubkey: bundle.from, sentAt: bundle.madeAt };
  const withheld = (bundle.withheld ?? []).map((w) => w.id);
  const counts = { added: 0, updated: 0, kept: 0 };
  for (const envelope of bundle.envelopes) {
    const { action } = rowFor(envelope);
    if (action === 'keep') { counts.kept += 1; continue; }
    const isSubject = envelope.type === bundle.subject.type && envelope.id === bundle.subject.id;
    // A sender's picked teams are never taken in (LW1): naming a team this browser also joined, they would send its work there.
    const { limitedTo: _picked, ...sent } = envelope.record as Record<string, unknown>;
    const record = envelope.type === 'report'
      ? { ...sent, metadata: { ...(sent.metadata as Record<string, unknown> | undefined), receivedFrom } }
      : { ...sent, receivedFrom: isSubject && withheld.length > 0 ? { ...receivedFrom, withheld } : receivedFrom };
    await intelWorkspaceManager.putFromBundle(envelope.type, record);
    counts[action === 'add' ? 'added' : 'updated'] += 1;
  }
  if (bundle.fromName) learnName(bundle.from, bundle.fromName, 'bundle');
  return counts;
}

/**
 * A copy of the person's own work (plan item 9.13b), previewed and imported
 * the way a bundle is: added, updated where the copy is newer, kept where the
 * record here is. Nobody sent it, so nothing is marked as received.
 */
export interface CopyPreview {
  owner: string;
  madeAt: string;
  rows: ImportRow[];
}

export function previewCopy(copy: OpenedCopy): CopyPreview {
  return { owner: copy.owner, madeAt: copy.madeAt, rows: copy.envelopes.map(rowFor) };
}

export async function applyCopy(copy: OpenedCopy): Promise<{ added: number; updated: number; kept: number }> {
  await intelWorkspaceManager.ensureInitialized();
  const counts = { added: 0, updated: 0, kept: 0 };
  for (const envelope of copy.envelopes) {
    const { action } = rowFor(envelope);
    if (action === 'keep') { counts.kept += 1; continue; }
    await intelWorkspaceManager.putFromBundle(envelope.type, envelope.record);
    counts[action === 'add' ? 'added' : 'updated'] += 1;
  }
  return counts;
}
