/**
 * What a bundle may carry, by each record's distribution (plan item 9.13;
 * decision G8, and the refinements the owner chose on 2026-09-29).
 *
 * Private stays put: a Private case or mission is never sent, and never
 * exported as a file. Limited and Public go, to the people named. One nobody
 * has decided on is asked about first, and until someone chooses it goes
 * nowhere, as it would go nowhere if published (plan item 0.5, decision D2).
 *
 * What a case or mission cites follows the same rule, refined:
 *   - a Private record it cites is left out, and so is what only that record
 *     cites. The people receiving it are told a record was kept back, by id,
 *     never by anything it holds;
 *   - an undecided record it cites goes with it, and stays undecided: the
 *     person sending it chose for the case, not for every record under it.
 *
 * Export as a file follows the same rule as sending: a file travels further
 * than a sealed message, and anyone who has it can read all of it. So does a
 * report's own download (plan item 9.13b, decision G8d). The one way Private
 * work leaves is a copy sealed to its owner's key (copy/workCopy.ts), which
 * every Private refusal on a file points to.
 */
import { isInformationVisibility, type InformationVisibility } from '../../../types/intel/IntelItemUI';
import type { BundledType, BundleSubjectType, KeptBack } from '../../exchange/bundle';
import { en, type Messages } from '../../../i18n/app/en';

/** The words these reasons are said in: a screen hands its language's in (D-ML, L3); English when none. */
type Reasons = Messages['reasons'];

/** A record left out of a bundle because it is Private. The title is for the person sending it, and goes no further. */
export interface WithheldRecord extends KeptBack {
  title: string;
}

/** A case or mission the rule keeps here. Sending shows it as a refusal, not a failure. */
export class StaysHere extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaysHere';
  }
}

/** Why this case or mission cannot be sent or exported, or null when it can. */
export function bundleRefusal(type: BundleSubjectType, visibility: InformationVisibility | undefined, words: Reasons = en.reasons): string | null {
  if (visibility === 'private') return `${words.privateStays[type]} ${words.handOn}`;
  if (visibility === undefined) return words.undecided[type];
  return null;
}

/** The same, for a file: a Private one also says how it can leave, sealed to its owner. */
export function exportRefusal(type: BundleSubjectType, visibility: InformationVisibility | undefined, words: Reasons = en.reasons): string | null {
  const refusal = bundleRefusal(type, visibility, words);
  return refusal && visibility === 'private' ? `${refusal} ${words.keepCopy}` : refusal;
}

/**
 * Whether a report came from the relay feed: someone published it, and the
 * ingest stored it (NostrStarcomIntelIngest marks every one it stores so).
 * Writing one of those out hands on nothing that was not already public.
 */
export const fromRelayFeed = (report: { history?: ReadonlyArray<{ action?: string; user?: string }> }): boolean =>
  (report.history ?? []).some((entry) => entry?.action === 'IMPORTED' && entry?.user === 'nostr');

/** Why a report's own plain download is refused, or null when it may go (plan item 9.13b, decision G8d). */
export function reportDownloadRefusal(report: {
  visibility?: InformationVisibility;
  history?: ReadonlyArray<{ action?: string; user?: string }>;
}, words: Reasons = en.reasons): string | null {
  if (fromRelayFeed(report)) return null;
  if (report.visibility === 'private') return `${words.privateStays.report} ${words.keepCopy}`;
  if (report.visibility === undefined) return words.undecided.report;
  return null;
}

/**
 * What a report's distribution lets happen to it, for the form that asks
 * (BD16). Choosing sends nothing: a report is not published by its
 * distribution, only allowed to go when someone sends, exports or publishes
 * it, under the rules above and the Exchange's (exchangeRefusal).
 */
export function reportReach(visibility: InformationVisibility | undefined, words: Reasons = en.reasons): string {
  switch (visibility) {
    case 'public':
      return words.reach.public;
    case 'limited':
      return words.reach.limited;
    case 'private':
      return words.privateStays.report;
    default:
      return words.reach.undecided;
  }
}

/**
 * A record's distribution as it is stored. A case and a mission hold it
 * themselves; a report keeps it in its metadata, and an intel item in its
 * frontmatter.
 */
export function storedVisibility(type: BundledType, record: Record<string, unknown>): InformationVisibility | undefined {
  const holder = type === 'report' ? record.metadata : type === 'item' ? record.frontmatter : record;
  const value = (holder as Record<string, unknown> | undefined)?.visibility;
  return isInformationVisibility(value) ? value : undefined;
}
