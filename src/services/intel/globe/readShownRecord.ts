/**
 * What the globe should draw for a shown Case or Mission, read from the live stores.
 *
 * The globe reads it (useShownRecord), again on every workspace change, and
 * "Show on the globe" reads it once to aim the camera (useShowOnGlobe). One
 * reader, so the camera and the pins cannot disagree about what a mission's
 * evidence is.
 */
import { missionEvidenceIds } from '../missionEvidence';
import type { ShownOnGlobe } from '../../../context/GlobeContext';
import { intelCaseService } from '../IntelCaseService';
import { intelReportService } from '../IntelReportService';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { missionService } from '../MissionService';
import { placeLinkedRecords, type LinkedRecordPlacement } from './linkedRecordPlacement';
import { publishedBy, resolveCitations } from './citedReports';
import { nameOf } from '../../identity/names';
import { nip19 } from 'nostr-tools';

const labelOf = (number: string | undefined, title: string) => [number, title].filter(Boolean).join(' · ');

/** A key's learned name, or its npub, short. */
const keyLabel = (pubkey: string): string => {
  const named = nameOf(pubkey)?.name;
  if (named) return named;
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return pubkey.slice(0, 12);
  }
};

export const readShownRecord = async (
  target: ShownOnGlobe,
): Promise<
  | { status: 'missing' }
  | {
      status: 'ready';
      label: string;
      placement: LinkedRecordPlacement;
      /** A Mission's linked cases, found or not: "its cases link nothing" is not "nothing linked". */
      caseCount?: number;
      /** A package's citations: how many, how many were found here, and which were not. */
      citations?: { cited: number; found: number; unresolved: string[] };
      /** How many reports the key has published that are here, drawn or not. */
      published?: number;
    }
> => {
  await intelWorkspaceManager.ensureInitialized();
  const reports = await intelReportService.listReports();
  const items = intelWorkspaceManager.getIntelItems();

  // Plan item 9.14 (decision G6): a package's citations, found among what its
  // signer published; or everything a key published, labelled as that.
  if (target.kind === 'package') {
    const { resolved, unresolved } = resolveCitations(target.signer, target.cites, reports);
    return {
      status: 'ready',
      label: target.name,
      placement: placeLinkedRecords(resolved, reports, items),
      citations: { cited: target.cites.length, found: target.cites.length - unresolved.length, unresolved },
    };
  }
  if (target.kind === 'publisher') {
    const ids = publishedBy(target.id, reports);
    return { status: 'ready', label: keyLabel(target.id), placement: placeLinkedRecords(ids, reports, items), published: ids.length };
  }

  if (target.kind === 'case') {
    const found = await intelCaseService.getCase(target.id);
    if (!found) return { status: 'missing' };
    return {
      status: 'ready',
      label: labelOf(found.caseNumber, found.title),
      placement: placeLinkedRecords(found.relatedEntities ?? [], reports, items),
    };
  }

  const mission = await missionService.getMission(target.id);
  if (!mission) return { status: 'missing' };
  // A Mission's evidence is what its cases link to, plus the reports attached
  // to it directly. Either one lets it pass its evidence gate.
  const cases = await Promise.all(mission.relatedCases.map((id) => intelCaseService.getCase(id)));
  const ids = missionEvidenceIds(mission, cases.filter((c): c is NonNullable<typeof c> => Boolean(c)));
  return {
    status: 'ready',
    label: labelOf(mission.missionNumber, mission.title),
    placement: placeLinkedRecords(ids, reports, items, cases.filter((c) => !c).length),
    caseCount: mission.relatedCases.length,
  };
};
