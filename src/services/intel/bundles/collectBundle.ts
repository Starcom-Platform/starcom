/**
 * What a bundle of a case or a mission carries (plan item 2.4): the record,
 * every report it cites, and the intel those reports and it cite, each with
 * its protected fields decrypted, since the bundle itself is what protects
 * them on the way (encrypted to each recipient, or a file the sender keeps).
 *
 * Other cases and missions it links to are not carried: they travel as
 * links, and show as absent until a bundle of their own arrives.
 *
 * Distribution decides the rest (plan item 9.13, decision G8; the rule is in
 * bundleDistribution.ts). A Private or undecided case or mission is refused
 * before anything is read. A Private record it cites is left out without
 * being read, and so is what only that record cites; it is returned as
 * withheld, for the person sending it to see and for the manifest to name.
 */
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { envelopeOf, makeBundle, type BundleFile, type BundleSubjectType, type RecordEnvelope } from '../../exchange/bundle';
import { bundleRefusal, StaysHere, storedVisibility, type WithheldRecord } from './bundleDistribution';

const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : []);

const unreadable = (what: string, title: string) =>
  new Error(`"${title}" is protected, and its ${what} cannot be read on this machine: its key is missing. Nothing was bundled.`);

/** What a bundle carries, and the Private records it cites that stay here. */
export interface CollectedBundle {
  envelopes: RecordEnvelope[];
  withheld: WithheldRecord[];
}

export async function collectBundle(subject: { type: BundleSubjectType; id: string }): Promise<CollectedBundle> {
  await intelWorkspaceManager.ensureInitialized();
  const envelopes: RecordEnvelope[] = [];
  const withheld: WithheldRecord[] = [];
  let cited: string[];

  if (subject.type === 'case') {
    const record = intelWorkspaceManager.getCase(subject.id);
    if (!record) throw new Error('That case is not in this workspace.');
    const refusal = bundleRefusal('case', record.visibility);
    if (refusal) throw new StaysHere(refusal);
    const description = await intelWorkspaceManager.decryptCaseDescription(record.id);
    if (description === null) throw unreadable('description', record.title);
    // Which teams the sender picked is theirs (LW1): it never travels.
    const { limitedTo: _case, ...shared } = record;
    envelopes.push(envelopeOf('case', { ...shared, description }));
    cited = [
      ...texts(record.relatedEntities),
      ...texts(record.contradictedBy),
      ...(record.requirements ?? []).flatMap((req) => texts(req.answeredBy)),
    ];
  } else {
    const record = intelWorkspaceManager.getMission(subject.id);
    if (!record) throw new Error('That mission is not in this workspace.');
    const refusal = bundleRefusal('mission', record.visibility);
    if (refusal) throw new StaysHere(refusal);
    const briefing = await intelWorkspaceManager.decryptMissionBriefing(record.id);
    if (briefing === null) throw unreadable('briefing', record.title);
    const { limitedTo: _mission, ...shared } = record;
    envelopes.push(envelopeOf('mission', { ...shared, briefing }));
    cited = [...texts(record.relatedReports), ...(record.objectives ?? []).map((o) => o.evidenceRef ?? '').filter(Boolean)];
  }

  const reports = intelWorkspaceManager.getReports();
  const items = new Set<string>();
  for (const id of new Set(cited)) {
    const report = reports.find((r) => r.id === id);
    if (report) {
      // Left out unread, and what it cites is not followed: only it led there.
      if (storedVisibility('report', report as unknown as Record<string, unknown>) === 'private') {
        withheld.push({ type: 'report', id: report.id, title: report.title });
        continue;
      }
      const content = await intelWorkspaceManager.decryptReportContent(report.id);
      if (content === null) throw unreadable('content', report.title);
      envelopes.push(envelopeOf('report', { ...report, content }));
      texts(report.sourceIntel).forEach((itemId) => items.add(itemId));
    } else if (intelWorkspaceManager.getStoredIntelItem(id)) {
      items.add(id);
    }
  }
  for (const id of items) {
    const item = intelWorkspaceManager.getStoredIntelItem(id);
    if (!item) continue;
    if (storedVisibility('item', item) === 'private') {
      const title = (item.frontmatter as { title?: unknown } | undefined)?.title;
      withheld.push({ type: 'item', id, title: typeof title === 'string' && title ? title : id });
      continue;
    }
    envelopes.push(envelopeOf('item', item));
  }
  return { envelopes, withheld };
}

/**
 * A case or a mission, bundled and signed as the person's signer, for a file:
 * the same rule as sending. What stayed here comes back beside the file, not
 * in it.
 */
export async function makeBundleOf(subject: { type: BundleSubjectType; id: string }): Promise<{ file: BundleFile; withheld: WithheldRecord[] }> {
  const { envelopes, withheld } = await collectBundle(subject);
  return { file: await makeBundle(subject, envelopes, withheld), withheld };
}
