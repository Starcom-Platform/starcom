/**
 * The reports this browser published, by report id (decision D-RP, RP4): where each went, as what note, when, and
 * when it was withdrawn (RP7).
 *
 * Kept so the report can say it was published, and whether it changed since; and so the intake, reading the note
 * back from the relays, does not set a second copy beside the report it came from (RP5). On another device the
 * note is read like anyone's.
 */
const KEY = 'starcom_published_reports';

export interface PublishedReport {
  /** The note's address, `30023:<pubkey>:<d>`: publishing again replaces what is there. */
  address: string;
  /** The event last sent. */
  eventId: string;
  /** When it was first published, ms: its `published_at`, kept when it is published again. */
  firstAt: number;
  /** When it was last published, ms. */
  at: number;
  /** How many relays took it. */
  relays: number;
  /** The report's own `updatedAt`, ms, when it was last published: a later one means it changed since. */
  reportUpdatedAt: number;
  /** When its author withdrew it, ms (RP7): its note now says only that. Publishing again clears it. */
  withdrawnAt?: number;
}

type Store = Record<string, PublishedReport>;

const listeners = new Set<() => void>();
/** Addresses being sent now, before the relays answer: a copy read back meanwhile is the same note (RP5). */
const sending = new Set<string>();
/** Parsed again only when what is stored changes: the intake asks for every note it reads. */
let cache: { raw: string | null; store: Store } | null = null;

function read(): Store {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return cache?.store ?? {};
  }
  if (cache && cache.raw === raw) return cache.store;
  let store: Store = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) store = parsed as Store;
  } catch {
    // Unreadable: nothing is recorded as published here.
  }
  cache = { raw, store };
  return store;
}

function write(store: Store): void {
  cache = null;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage refused: the note is published all the same, and the report does not say so on this device.
  }
  listeners.forEach((listener) => listener());
}

/** Where and when this report was published from here, or null. */
export function publishedReport(reportId: string): PublishedReport | null {
  return read()[reportId] ?? null;
}

export function recordReportPublished(reportId: string, published: PublishedReport): void {
  write({ ...read(), [reportId]: published });
}

/** While a note is being sent: its copy read back is this report's (RP5). Returns the call that ends it. */
export function markSending(address: string): () => void {
  sending.add(address);
  return () => { sending.delete(address); };
}

/** Whether a note at this address is one of this browser's published reports, read back from a relay (RP5). */
export function isOwnPublishedReport(address: string): boolean {
  if (sending.has(address)) return true;
  return Object.values(read()).some((p) => p.address === address);
}

export function subscribePublishedReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * What a kept note's going means for its report (work package W1): it was published, or it was withdrawn. Kept in
 * the outbox beside the signed note, since the review that knew it closed when no relay answered.
 */
export type AfterSent =
  | { published: { report: string; address: string; firstAt: number; reportUpdatedAt: number } }
  | { withdrawn: { report: string; at: number } };

/** Records that a kept note went: `signedAt` is when it was signed, which is when its review said yes. */
export function recordAfterSent(after: AfterSent, eventId: string, signedAt: number, relays: number): void {
  if ('published' in after) {
    const { report, address, firstAt, reportUpdatedAt } = after.published;
    recordReportPublished(report, { address, eventId, firstAt, at: signedAt, relays, reportUpdatedAt });
    return;
  }
  const { report, at } = after.withdrawn;
  const published = publishedReport(report);
  if (published) recordReportPublished(report, { ...published, eventId, relays, withdrawnAt: at });
}
