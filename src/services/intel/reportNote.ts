/**
 * A report as the note that publishes it (decision D-RP, RP1 to RP3).
 *
 * Kind 30023, NIP-23 long-form, in the shape the globe's intake reads (the interchange spec, "Globe intel"): the
 * report's title as the first line, then its summary and its text, so every Starcom globe shows the report itself,
 * not an address of it; `t=starcom_intel`; its place as a geohash no finer than the precision it was given; the
 * jurisdictions, sources and observations it names. Addressed by the report's id, so publishing it again replaces
 * the published version rather than adding a second.
 *
 * The Exchange's "Publish a report" sends a package to IPFS and a note carrying only its address, its title and a
 * checksum of each report's text. With no pinning service, nobody else could fetch the package; this note carries
 * the report on the relays themselves.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { requiresCare } from '../../types/intel/IntelItemUI';
import { APP_KINDS } from '../nostr/kindRegistry';
import { geohashWithin } from '../geoint/statedPrecision';
import { fromRelayFeed } from './bundles/bundleDistribution';
import { safeSourceLinks } from './sourceLinks';
import { citeTags } from './citations';
import { KIND_DELETION } from '../rlsh/rlshCard';

export interface ReportNoteTemplate {
  kind: number;
  tags: string[][];
  content: string;
}

type Publishable = Pick<IntelReportUI,
  'id' | 'title' | 'content' | 'summary' | 'tags' | 'latitude' | 'longitude' | 'geoPrecisionM' | 'jurisdictions'
  | 'sourceLinks' | 'cites' | 'visibility' | 'sensitivity' | 'receivedFrom' | 'history'>;

const TOPICS_MAX = 20;
const TOPIC_LENGTH_MAX = 50;

/** The author's tags as Nostr topics: lowercased, spaces as hyphens, no `#`, each once (NIP-24). */
export function reportTopics(tags: readonly string[] | undefined): string[] {
  const topics: string[] = [];
  for (const tag of tags ?? []) {
    const topic = String(tag).trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (!topic || topic.length > TOPIC_LENGTH_MAX || topic === 'starcom_intel' || topics.includes(topic)) continue;
    topics.push(topic);
    if (topics.length === TOPICS_MAX) break;
  }
  return topics;
}

const placed = (r: Pick<IntelReportUI, 'latitude' | 'longitude'>): r is { latitude: number; longitude: number } =>
  typeof r.latitude === 'number' && typeof r.longitude === 'number' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude);

/** What the note says, as a reader meets it: the title, a blank line, the summary when there is one, then the text. */
function reportNoteContent(report: Pick<IntelReportUI, 'title' | 'summary' | 'content'>): string {
  return [report.title.trim(), report.summary?.trim(), report.content.trim()].filter(Boolean).join('\n\n');
}

/**
 * Why this report may not be published to the public relays, or null when it may (RP2). Each reason says what to do.
 */
export function reportPublishRefusal(report: Publishable): string | null {
  if (fromRelayFeed(report)) return 'This report was read from the relays: it is its author\'s note, not yours. Only your own reports are published from here.';
  if (report.receivedFrom) return 'This report was sent to you. Only your own reports are published from here.';
  if (!report.title.trim() || !report.content.trim()) return 'A report needs a title and text before it is published.';
  if (report.visibility === undefined) return 'Nobody has decided who may receive this report, so it goes nowhere yet. Mark it Public to publish it.';
  if (report.visibility !== 'public') {
    const named = report.visibility === 'limited' ? 'Limited' : 'Private';
    return `This report is ${named}. Only a Public report goes to the public relays: change who may receive it first.`;
  }
  if (requiresCare(report.sensitivity)) {
    return 'This report is marked as holding source or method detail. Take that detail out and mark it Open, then publish it.';
  }
  // The intake reads a note whose text begins with [ or { as a map payload; with no place to fall back on, it is dropped.
  if (!placed(report) && /^[[{]/.test(report.title.trim())) {
    return 'Other globes read a note that begins with [ or { as a map, and would drop this one, which has no place. Begin the title with a word, or give the report a place.';
  }
  return null;
}

/**
 * The note, unsigned (RP1). `firstPublishedAt` is in seconds: the first time this report was published, kept when
 * it is published again, as NIP-23's `published_at`. `agent` is the publisher's name when their key is marked as an
 * AI agent's (MX14).
 */
export function reportNoteTemplate(report: Publishable, firstPublishedAt: number, agent?: string): ReportNoteTemplate {
  const tags: string[][] = [
    ['d', report.id],
    ['title', report.title.trim()],
    ['published_at', String(Math.floor(firstPublishedAt))],
    ['t', 'starcom_intel'],
  ];
  const summary = report.summary?.trim();
  if (summary) tags.push(['summary', summary]);
  for (const topic of reportTopics(report.tags)) tags.push(['t', topic]);
  if (placed(report)) {
    // RP3: never finer than the precision given; the precision itself, in metres, when there is one.
    const precision = typeof report.geoPrecisionM === 'number' && report.geoPrecisionM > 0 ? report.geoPrecisionM : undefined;
    tags.push(['g', geohashWithin(report.latitude, report.longitude, precision)]);
    if (precision) tags.push(['geo_precision', `${Math.round(precision)}m`]);
  }
  for (const code of new Set((report.jurisdictions ?? []).map((j) => j.trim().toLowerCase()).filter(Boolean))) {
    tags.push(['jurisdiction', code]);
  }
  for (const url of safeSourceLinks(report.sourceLinks ?? [])) tags.push(['r', url]);
  tags.push(...citeTags(report.cites ?? []));
  if (agent) tags.push(['agent', agent]);
  return { kind: APP_KINDS.LONGFORM_INTEL, tags, content: reportNoteContent(report) };
}

/** What a withdrawn report's note says in its place (RP7). */
export const WITHDRAWN_TEXT = 'Withdrawn by its author.';

/**
 * Withdrawing a published report (RP7): a NIP-09 deletion request for its address, and a version that replaces it,
 * tagged `retracted`, saying only that it was withdrawn: neither repeats its title, text, place or topics. A deletion
 * by address removes every version up to its own time, so the replacement is signed a second later; were it deleted
 * too, other Starcom readers would never learn to drop the copy they saved.
 */
export function reportWithdrawalTemplates(
  published: { address: string; eventId: string },
  reportId: string,
): { deletion: ReportNoteTemplate; notice: ReportNoteTemplate } {
  return {
    deletion: {
      kind: KIND_DELETION,
      tags: [['a', published.address], ['e', published.eventId], ['k', String(APP_KINDS.LONGFORM_INTEL)]],
      content: WITHDRAWN_TEXT,
    },
    notice: {
      kind: APP_KINDS.LONGFORM_INTEL,
      tags: [['d', reportId], ['title', 'Withdrawn'], ['t', 'starcom_intel'], ['t', 'retracted']],
      content: WITHDRAWN_TEXT,
    },
  };
}
