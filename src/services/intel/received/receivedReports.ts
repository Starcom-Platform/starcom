/**
 * The reports sealed to this person on the missions they published (the owner's MX32, 2026-10-23): NavCom's kind
 * 1912, opened from the sealed inbox, kept on this device by the id inside the seal, which a settlement names (§5.3).
 *
 * Read as NavCom reads one (§5.2): a mission named by its `a` tag, and that mission this person's; the day as
 * YYYY-MM-DD; each count on a line, a whole number; a 32-hex salt, which a sealed report carries. Anything else is not
 * kept. Who sent it is the key that sealed it; its callsign is the reporter's own word. Never posted, never shared.
 *
 * A return from an adventure this person called is the same kind, naming the adventure (30084) and saying whether
 * its sender saw it (RS41): it may carry no counts at all.
 */
import type { OpenedWrap } from '../../nostr/sealedInbox';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { REPORT_KIND } from './missionReport';

export interface ReceivedReport {
  /** The id inside its seal: what a settlement names. */
  id: string;
  /** The mission it is on, `30079:<this person's key>:<d>`. */
  coordinate: string;
  /** The key that sealed it. */
  from: string;
  callsign?: string;
  day: string;
  counts: Array<{ line: string; n: number }>;
  /** Its own time, unix seconds: the start of its day, as a report states it. */
  at: number;
  /** On a return from an adventure: whether its sender saw it. */
  seen?: boolean;
}

const KEY = 'starcom.receivedReports.v1';
const KEPT = 2_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SALT = /^[0-9a-f]{32}$/;
const listeners = new Set<() => void>();

function load(): ReceivedReport[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
let held: ReceivedReport[] = load();

function persist(next: ReceivedReport[]): void {
  held = next.slice(-KEPT);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(held)); } catch { /* storage refused: kept this session */ }
  listeners.forEach((listener) => listener());
}

/** A report as read from what was opened, or null when it is not one of this person's missions' reports. */
export function readReceivedReport(opened: Pick<OpenedWrap, 'rumor' | 'sender'>, me: string | null): ReceivedReport | null {
  const { rumor, sender } = opened;
  if (rumor.kind !== REPORT_KIND || !me) return null;
  const coordinate = rumor.tags.find((t) => t[0] === 'a' && typeof t[1] === 'string')?.[1] ?? '';
  const [kind, owner] = coordinate.split(':');
  if ((kind !== '30079' && kind !== '30084') || owner !== me) return null;
  let content: Record<string, unknown>;
  try { content = JSON.parse(rumor.content); } catch { return null; }
  if (!content || typeof content !== 'object') return null;
  if (typeof content.date !== 'string' || !DAY.test(content.date)) return null;
  if (typeof content.salt !== 'string' || !SALT.test(content.salt)) return null;
  if (!Array.isArray(content.counts)) return null;
  const counts = content.counts.filter((c): c is { line: string; n: number } =>
    !!c && typeof c.line === 'string' && c.line.length <= 200 && Number.isInteger(c.n) && c.n >= 0 && c.n <= 1_000_000_000);
  // A return says whether its sender saw it, and may count nothing; a report counts something.
  const isReturn = kind === '30084';
  if (isReturn ? typeof content.seen !== 'boolean' : counts.length === 0) return null;
  const callsign = typeof content.callsign === 'string' && content.callsign.trim() ? content.callsign.trim().slice(0, 64) : undefined;
  return {
    id: rumor.id, coordinate, from: sender, ...(callsign ? { callsign } : {}), day: content.date, counts, at: rumor.created_at,
    ...(isReturn ? { seen: content.seen as boolean } : {}),
  };
}

/** The sealed inbox's handler for kind 1912: keeps a report on one of this person's missions, once. */
export function keepReceivedReport(opened: Pick<OpenedWrap, 'rumor' | 'sender'>): void {
  const report = readReceivedReport(opened, nostrIdentityService.signerPubkey() ?? nostrIdentityService.getPubkey());
  if (!report || held.some((r) => r.id === report.id)) return;
  persist([...held, report]);
}

/** The reports on this mission, newest day first. */
export function reportsOn(coordinate: string): ReceivedReport[] {
  return held.filter((r) => r.coordinate === coordinate).sort((a, b) => b.at - a.at);
}

export function subscribeReceivedReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** For tests: forget every report kept here. */
export function resetReceivedReports(): void {
  persist([]);
}
