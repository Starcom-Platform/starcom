/**
 * Publishing one report to the globe (decision D-RP; the owner, 20 Nov 2026: "public publishing should work"),
 * through the review every publish passes: the note exactly as it will be signed, its place as other globes will
 * read it, what stays on this device, and the public relays it goes to. Publishing it again replaces the published
 * version at the same address (RP1). On a yes it is signed and sent, and the report records where it went (RP4).
 */
import { requestReview, sha256Hex, type ReviewContent, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { citeRows } from './citeRows';
import { publishRelays } from '../nostr/publishTargets';
import { sendOrKeep } from './keepUnsent';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { publishedCallsign, publishesAsAgent } from '../identity/callsign';
import { stableStringify } from '../intel/findings/signFinding';
import { geohashCellRadiusM } from '../geoint/statedPrecision';
import {
  WITHDRAWN_TEXT, reportNoteTemplate, reportPublishRefusal, reportTopics, reportWithdrawalTemplates, type ReportNoteTemplate,
} from '../intel/reportNote';
import { markSending, publishedReport, recordReportPublished } from '../intel/publishedReports';
import { formatCoordinate } from '../../types/intel/SourceObservation';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

/** What a public report's publication does, in the app's words. */
export const REPORT_PUBLIC_WORDS = 'Anyone can read it, on the public relays and on every Starcom globe, and it cannot be recalled. '
  + 'Publishing it again replaces it on relays that keep the newest version; a copy someone already took stays.';

interface ReportSend {
  template: ReportNoteTemplate;
  relays: string[];
}

const distance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** Where other globes will put it, from the note's own tags. */
function placeWords(report: IntelReportUI, tags: readonly string[][]): string {
  const g = tags.find((t) => t[0] === 'g')?.[1];
  if (g && typeof report.latitude === 'number' && typeof report.longitude === 'number') {
    const radius = geohashCellRadiusM(g) ?? 0;
    const near = `Near ${formatCoordinate(report.latitude, report.longitude)}, as geohash ${g}: other globes place it within ${distance(radius)} of your point`;
    const precision = tags.find((t) => t[0] === 'geo_precision')?.[1];
    return precision ? `${near}, known to within ${distance(parseFloat(precision))}.` : `${near}.`;
  }
  const codes = tags.filter((t) => t[0] === 'jurisdiction').map((t) => t[1].toUpperCase());
  if (codes.length) return `Drawn as ${codes.join(', ')}; no point is published.`;
  return 'It names no place: other globes list it, and do not draw it.';
}

/** What the report holds that the note does not carry. */
function staysHere(report: IntelReportUI): string | null {
  const kept = [
    report.startDate && 'when it happened (other globes do not read it yet)',
    (report.conclusions?.length || report.recommendations?.length) && 'its conclusions and recommendations (assessment is recorded on a case)',
    report.confidence !== undefined && 'its confidence',
    report.priority && 'its severity',
    report.collaborators?.length && 'its collaborators',
  ].filter((k): k is string => typeof k === 'string');
  return kept.length ? `${kept.join('; ')}.` : null;
}

export function showReportNote(report: IntelReportUI, p: Readonly<ReportSend>, previous: { at: number } | null): ReviewContent {
  const topics = reportTopics(report.tags);
  const sources = p.template.tags.filter((t) => t[0] === 'r').map((t) => t[1]);
  const kept = staysHere(report);
  return {
    title: report.title.trim(),
    body: p.template.content,
    fields: [
      { label: 'Who can read it', value: REPORT_PUBLIC_WORDS },
      { label: 'Place', value: placeWords(report, p.template.tags) },
      ...(topics.length ? [{ label: 'Topics', value: topics.join(', ') }] : []),
      ...(sources.length ? [{ label: 'Sources', value: sources.join('\n') }] : []),
      ...citeRows(report.cites ?? []),
      ...(previous ? [{ label: 'Replaces', value: `The version published ${utc(previous.at)}` }] : []),
      ...(kept ? [{ label: 'Stays on this device', value: kept }] : []),
    ],
    raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
  };
}

/** How many relays took it; `kept` when none did, and it waits on this device to go when one answers (W1). */
export interface ReportSent {
  relays: number;
  kept?: true;
}

/** Show, and on a yes publish, this report as a note every Starcom globe reads. */
export async function reviewReportPublish(report: IntelReportUI, now: number = Date.now()): Promise<ReviewOutcome<ReportSent>> {
  const refused = reportPublishRefusal(report);
  if (refused) return { status: 'refused', reason: refused };
  const previous = publishedReport(report.id);
  const firstAt = previous?.firstAt ?? now;
  const template = reportNoteTemplate(report, firstAt / 1000, publishesAsAgent() ? (publishedCallsign() ?? 'agent') : undefined);
  const relays = publishRelays('INTEL');
  const outcome = await requestReview<ReportSend, ReportSent>({
    act: previous ? 'Publish the report again' : 'Publish the report',
    payload: { template, relays },
    sample: report.sample === true,
    show: (p) => showReportNote(report, p, previous),
    destinations: destinationsFor(relays),
    digest: (p) => sha256Hex(stableStringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content })),
    digestLabel: 'the note, as it will be signed',
    notice: REPORT_PUBLIC_WORDS,
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => {
      // The address is known before the relays answer, so a copy read back meanwhile is this report's (RP5).
      const pubkey = await nostrIdentityService.asSigner('publishing your report').getPublicKey();
      const address = `${p.template.kind}:${pubkey}:${report.id}`;
      const sending = markSending(address);
      const reportUpdatedAt = new Date(report.updatedAt).getTime();
      try {
        // No relay answering keeps it here, to go when one does; the report says it was published only then (W1).
        const sent = await sendOrKeep(p.template, p.relays, now, { published: { report: report.id, address, firstAt, reportUpdatedAt } });
        if (sent.kept) return { relays: 0, kept: true };
        recordReportPublished(report.id, { address, eventId: sent.event.id, firstAt, at: now, relays: sent.relays, reportUpdatedAt });
        return { relays: sent.relays };
      } finally {
        sending();
      }
    },
  });
  return outcome;
}

/** What withdrawing does, in the app's words (RP7). */
export const WITHDRAW_REPORT_WORDS = 'Relays that keep only the newest version replace the report with a notice that it was withdrawn, '
  + 'and every relay is asked to delete it. Starcom globes take it off when they next read. '
  + 'A copy someone already took stays, and a relay may ignore the request.';

interface WithdrawalSend {
  deletion: ReportNoteTemplate;
  notice: ReportNoteTemplate;
  relays: string[];
}

/** Show, and on a yes send, the withdrawal of a report published from here (RP7). */
export async function reviewReportWithdrawal(report: IntelReportUI, now: number = Date.now()): Promise<ReviewOutcome<ReportSent>> {
  const published = publishedReport(report.id);
  if (!published) return { status: 'refused', reason: 'This report was not published from this browser, so there is nothing here to withdraw.' };
  if (published.withdrawnAt) return { status: 'refused', reason: 'This report is already withdrawn.' };
  const signer = await nostrIdentityService.refreshSigner();
  const publishedBy = published.address.split(':')[1];
  // A relay honours a deletion only from the key that signed what it deletes, and the address is that key's.
  if (signer && signer !== publishedBy) return { status: 'refused', reason: 'It was published under another key, and only that key can withdraw it.' };
  const { deletion, notice } = reportWithdrawalTemplates(published, report.id);
  const relays = publishRelays('INTEL');
  return requestReview<WithdrawalSend, ReportSent>({
    act: 'Withdraw the report',
    payload: { deletion, notice, relays },
    show: (p) => ({
      title: `Withdraw "${report.title.trim()}"`,
      body: p.notice.content,
      fields: [
        { label: 'What happens', value: WITHDRAW_REPORT_WORDS },
        { label: 'Replaces', value: `The version published ${utc(published.at)}` },
        { label: 'What goes', value: `Only "${WITHDRAWN_TEXT}": not its title, its text, its place or its topics.` },
      ],
      raw: JSON.stringify([p.deletion, p.notice], null, 2),
    }),
    destinations: destinationsFor(relays),
    digest: (p) => sha256Hex(stableStringify([p.deletion, p.notice])),
    digestLabel: 'the request and the notice, as they will be signed',
    notice: WITHDRAW_REPORT_WORDS,
    signer,
    send: async (p) => {
      // The deletion first, and the notice a second later, so a deletion by address does not take the notice too.
      // Either one no relay takes waits here and goes later (W1); their times keep that order whichever arrives first.
      try {
        await sendOrKeep(p.deletion, p.relays, now);
      } catch {
        // Every relay refused the deletion: the notice still replaces the report wherever the newest version is kept.
      }
      const replaced = await sendOrKeep(p.notice, p.relays, now + 1000, { withdrawn: { report: report.id, at: now } });
      if (replaced.kept) return { relays: 0, kept: true };
      recordReportPublished(report.id, { ...published, eventId: replaced.event.id, relays: replaced.relays, withdrawnAt: now });
      return { relays: replaced.relays };
    },
  });
}
