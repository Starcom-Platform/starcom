/**
 * What a portfolio holds (decision D-EX, EX12, EX20, EX26, EX28, EX30): the work under one key, for
 * an advisor to read and check, for an intern's college credit.
 *
 * - What the key published, read from Starcom's public relays as the signed events they hold (EX30), so
 *   a portfolio made on a new laptop is whole and every signature is the relays' own. Published is
 *   public, so these are shown in full.
 * - Evidence the key signed for, by fingerprint and timestamp, never its files. Its custody record names
 *   the page, so evidence only listed carries no record, and nothing of it but its kind and date.
 * - The cases, missions and reports in this browser made under the key: in full when marked Public, else
 *   listed by kind and date only, saying why (EX28). "Careful" means "redact before emitting", and a
 *   portfolio is emitted, so careful work is listed too; so is work nobody has marked yet.
 *
 * Nothing someone else made, nothing received from others, no sample material; a report published from
 * here is listed once, with its event. Pure: the app hands in its records and a relay read.
 */
import type { Event } from 'nostr-tools';
import type { KeptCustody } from '../../extension/keepEvidence';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { ContentSensitivity, InformationVisibility, IntelItemUI } from '../../types/intel/IntelItemUI';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { MissionUI } from '../../types/intel/MissionUI';

export const PORTFOLIO_FORMAT = 'starcom.portfolio';
export const PORTFOLIO_VERSION = 1;

export type PortfolioItemKind = 'case' | 'mission' | 'report' | 'evidence' | 'claim' | 'refutation' | 'package' | 'review';
/** The order a portfolio reads in. */
export const PORTFOLIO_SECTIONS: readonly PortfolioItemKind[] = ['case', 'mission', 'report', 'evidence', 'claim', 'refutation', 'package', 'review'];

export interface PortfolioItem {
  kind: PortfolioItemKind;
  /** When it was made, or published, UTC ISO 8601. */
  at: string;
  /** In full; else listed by kind and date only. */
  shown: boolean;
  /** Why it is only listed: 'Private', 'Limited', 'marked careful', 'marked protected', 'not marked'. */
  listedBecause?: string;
  title?: string;
  text?: string;
  status?: string;
  /** A captured page's address. */
  url?: string;
  /** An evidence file's SHA-256 each. */
  fingerprints?: string[];
  /** The calendars that timestamped it, by host. */
  timestampedBy?: string[];
  /** The signed events that back it, by id; each is in the portfolio's events. */
  eventIds?: string[];
}

export interface Portfolio {
  format: typeof PORTFOLIO_FORMAT;
  version: number;
  /** The key the work is under, hex. */
  key: string;
  madeAt: string;
  items: PortfolioItem[];
  /** Every signed event an item rests on, whole, so each signature can be checked. */
  events: Event[];
  /** Where the published work was read, and whether the read was whole. */
  read: { relays: string[]; complete: boolean; note?: string };
  /** What was left out and could have been in, by count. */
  leftOut?: { unsignedEvidence?: number };
}

export interface PortfolioSources {
  key: string;
  reports(): Promise<IntelReportUI[]>;
  cases(): IntelCaseUI[];
  missions(): MissionUI[];
  evidence(): Promise<Array<{ item: IntelItemUI; custody?: KeptCustody }>>;
  /** What the key published, read from the public relays. */
  published(key: string): Promise<{ events: Event[]; complete: boolean; relays: string[]; note?: string }>;
  now?(): Date;
}

/** In full only when marked Public and not careful or protected (EX28). */
export function handling(visibility?: InformationVisibility, sensitivity?: ContentSensitivity): { shown: boolean; listedBecause?: string } {
  if (sensitivity === 'protected') return { shown: false, listedBecause: 'marked protected' };
  if (sensitivity === 'careful') return { shown: false, listedBecause: 'marked careful' };
  if (visibility === 'public') return { shown: true };
  if (visibility === 'private') return { shown: false, listedBecause: 'Private' };
  if (visibility === 'limited') return { shown: false, listedBecause: 'Limited' };
  return { shown: false, listedBecause: 'not marked' };
}

const iso = (when: unknown): string => {
  const ms = when instanceof Date ? when.getTime() : typeof when === 'string' ? Date.parse(when) : typeof when === 'number' ? when : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
};
const tag = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1];
const firstLine = (text: string) => text.split('\n').find((l) => l.trim())?.trim().slice(0, 120) ?? '';
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
/** A note its author withdrew (D-RP, RP7): not offered as their work. */
const withdrawnNote = (e: Event) => e.tags.some((t) => t[0] === 't' && t[1] === 'retracted');
const mine = (key: string, author: unknown, record: { sample?: boolean; receivedFrom?: unknown }) =>
  author === key && !record.sample && !record.receivedFrom;

const EVENT_KINDS: Record<number, PortfolioItemKind> = { 30023: 'report', 30082: 'claim', 30083: 'refutation', 30079: 'package', 1111: 'review', 1985: 'review' };

/** Each published event once; an addressable one at its newest. */
function latestEvents(events: Event[], key: string): Event[] {
  const byId = new Map<string, Event>();
  for (const e of events) if (e.pubkey === key && EVENT_KINDS[e.kind] && (e.kind !== 30023 || e.tags.some((t) => t[0] === 't' && t[1] === 'starcom_intel'))) byId.set(e.id, e);
  const byAddress = new Map<string, Event>();
  for (const e of byId.values()) {
    const d = tag(e, 'd');
    const address = e.kind >= 30000 && e.kind < 40000 && d !== undefined ? `${e.kind}:${d}` : e.id;
    const held = byAddress.get(address);
    if (!held || e.created_at > held.created_at) byAddress.set(address, e);
  }
  return [...byAddress.values()].sort((a, b) => a.created_at - b.created_at);
}

export async function gatherPortfolio(s: PortfolioSources): Promise<Portfolio> {
  const key = s.key;
  const [reports, evidence, read] = await Promise.all([s.reports(), s.evidence(), s.published(key)]);
  const published = latestEvents(read.events, key);
  const events: Event[] = [...published];
  const items: PortfolioItem[] = [];
  const claimedEvents = new Set<string>();
  const withheld = new Set<string>();
  for (const e of published) if (withdrawnNote(e)) withheld.add(e.id);

  for (const c of s.cases()) {
    if (!mine(key, c.createdBy, c)) continue;
    const h = handling(c.visibility, c.sensitivity);
    items.push({
      kind: 'case', at: iso(c.startDate), ...h,
      ...(h.shown ? {
        title: c.title, status: String(c.status),
        text: [c.description, c.position ? `Position (${c.position.verdict}): ${c.position.statement}` : ''].filter(Boolean).join('\n\n'),
      } : {}),
    });
  }
  for (const m of s.missions()) {
    if (!mine(key, m.createdBy, m)) continue;
    const h = handling(m.visibility, m.sensitivity);
    items.push({ kind: 'mission', at: iso(m.createdAt), ...h, ...(h.shown ? { title: m.title, status: String(m.status), text: m.briefing } : {}) });
  }
  for (const r of reports) {
    if (!mine(key, r.author, r)) continue;
    const h = handling(r.visibility, r.sensitivity);
    // A report published from here is listed once, with its event; one its author now lists, without it. Its note is
    // at its own id when published from its panel (D-RP), or at its IPFS address when it went through the Exchange.
    const d = r.ipfsHash ? `starcom_intel_${r.ipfsHash.substring(0, 16)}` : null;
    const note = published.find((e) => e.kind === 30023 && (tag(e, 'd') === r.id || (d !== null && tag(e, 'd') === d)));
    if (note) claimedEvents.add(note.id);
    // Withdrawn, it is listed as the report it is here, with no event.
    const event = note && !withdrawnNote(note) ? note : undefined;
    if (event && !h.shown) withheld.add(event.id);
    items.push({
      kind: 'report', at: iso(r.createdAt), ...h,
      ...(h.shown ? { title: r.title, status: String(r.status), text: r.content, ...(event ? { eventIds: [event.id] } : {}) } : {}),
    });
  }
  let unsignedEvidence = 0;
  for (const { item, custody } of evidence) {
    if (!custody?.event) { if (custody?.unsigned) unsignedEvidence += 1; continue; }
    if (custody.event.pubkey !== key) continue;
    const h = handling(item.visibility, item.sensitivity);
    // The custody record names the page and its files' hashes, so evidence only listed carries none of it.
    if (h.shown) events.push(custody.event);
    items.push({
      kind: 'evidence', at: iso(custody.capture.at || item.createdAt), ...h,
      ...(h.shown ? {
        title: item.title, url: custody.capture.page.url,
        fingerprints: (custody.capture.files ?? []).map((f) => f.sha256),
        ...(custody.capture.timestamps ? { timestampedBy: custody.capture.timestamps.calendars.map(hostOf) } : {}),
        eventIds: [custody.event.id],
      } : {}),
    });
  }
  for (const e of published) {
    if (claimedEvents.has(e.id) || withdrawnNote(e)) continue;
    items.push({ kind: EVENT_KINDS[e.kind], at: iso(e.created_at * 1000), shown: true, title: tag(e, 'title') ?? firstLine(e.content), text: e.content, eventIds: [e.id] });
  }

  const order = (k: PortfolioItemKind) => PORTFOLIO_SECTIONS.indexOf(k);
  items.sort((a, b) => order(a.kind) - order(b.kind));
  return {
    format: PORTFOLIO_FORMAT, version: PORTFOLIO_VERSION, key,
    madeAt: (s.now?.() ?? new Date()).toISOString(),
    items, events: events.filter((e) => !withheld.has(e.id)),
    read: { relays: read.relays, complete: read.complete, ...(read.note ? { note: read.note } : {}) },
    ...(unsignedEvidence ? { leftOut: { unsignedEvidence } } : {}),
  };
}
