/**
 * The Wayback Machine in NetRunner (decision D-EX, EX34, W10d): a page's snapshots listed, two the person
 * picks compared, and the Archive credited.
 *
 * - **What can be read where.** The availability API answers any site, but only with the closest
 *   snapshot. The full index (CDX) and a snapshot's own page do not answer other sites, so they are read
 *   through Starcom Uplink or the desktop app (siteFetcher, EX32), with a purpose naming the page.
 * - **The Archive's terms** (31 Dec 2014, read 2026-10-12, record D-L): "scholarship and research
 *   purposes only", and "not to collect or store personal data about anyone". So a comparison is shown
 *   and not kept. Filing a snapshot keeps its address, time and the Archive's digest, never the page,
 *   and only at the person's click.
 * - **Credit.** The panel names the Archive. A filed snapshot names it as its source, and a published
 *   case position resting on one says so (`citesTheArchive`), as the terms ask of published research.
 *
 * Pure but for the reads handed in.
 */
import type { SiteFetcher } from '../../../extension/siteFetcher';
import { CAPTURE_CATEGORY, CAPTURE_TAG, literal } from '../../../extension/captureItems';
import type { CreateIntelItemInput } from '../../../types/intel/IntelItemUI';
import { formatUtcDate } from '../../../utils/utcTime';

/** The tag a filed snapshot carries, beside the capture tag. */
export const WAYBACK_TAG = 'wayback';

export const WAYBACK_CREDIT = { name: 'Internet Archive, Wayback Machine', url: 'https://web.archive.org/' } as const;

export interface Snapshot {
  /** The Archive's 14-digit capture time, UTC. */
  timestamp: string;
  /** The same time, ISO 8601 ending Z. */
  at: string;
  original: string;
  /** The status the page answered the Archive with: "200", "301", or "-" for none. */
  status: string;
  /** The Archive's digest of what it kept: two snapshots with one digest hold the same bytes. */
  digest?: string;
  /** The Archive's stored record, compressed: not the page's size, so it is never shown as one. */
  length?: number;
  /** The snapshot as the Archive shows it. */
  replay: string;
  /** The page as it was archived, without the Archive's toolbar. */
  raw: string;
}

/** A 14-digit Wayback time as ISO 8601 UTC, or null when it is not one. */
export function waybackTime(ts: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

const snapshotAt = (timestamp: string, original: string, status: string, digest?: string, length?: number): Snapshot | null => {
  const at = waybackTime(timestamp);
  if (!at || !original) return null;
  return {
    timestamp, at, original, status, ...(digest ? { digest } : {}), ...(length !== undefined && Number.isFinite(length) ? { length } : {}),
    replay: `https://web.archive.org/web/${timestamp}/${original}`,
    raw: `https://web.archive.org/web/${timestamp}id_/${original}`,
  };
};

/** The index of a page's snapshots: one per distinct content in a row, the latest 200. */
export const cdxUrl = (target: string, limit = 200): string =>
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&fl=timestamp,original,statuscode,digest,length&collapse=digest&limit=-${limit}`;

/** The index's rows as snapshots, newest first; a malformed row is left out. */
export function parseCdx(rows: unknown): Snapshot[] {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) return [];
  const header = rows[0] as string[];
  const col = (row: unknown[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 && typeof row[i] === 'string' ? (row[i] as string) : undefined;
  };
  return rows.slice(1)
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => snapshotAt(col(row, 'timestamp') ?? '', col(row, 'original') ?? '', col(row, 'statuscode') ?? '-', col(row, 'digest'), Number(col(row, 'length'))))
    .filter((s): s is Snapshot => s !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** The availability API's closest snapshot, or null when it has none. */
export function closestSnapshot(answer: unknown): Snapshot | null {
  const closest = (answer as { archived_snapshots?: { closest?: { available?: boolean; status?: string; timestamp?: string; url?: string } } })?.archived_snapshots?.closest;
  if (!closest?.available || !closest.timestamp || !closest.url) return null;
  const original = closest.url.replace(/^https?:\/\/web\.archive\.org\/web\/\d{14}\//, '');
  return snapshotAt(closest.timestamp, original, closest.status ?? '-');
}

const hostOf = (target: string) => {
  try { return new URL(/^https?:\/\//.test(target) ? target : `https://${target}`).host; } catch { return target.slice(0, 60); }
};

export interface SnapshotList {
  snapshots: Snapshot[];
  /** The full index, or only the closest snapshot. */
  complete: boolean;
  via?: SiteFetcher['via'];
  note?: string;
}

/**
 * A page's snapshots: the full index through Uplink or the desktop app; in a plain browser, the closest
 * one, saying so. A failed read is "could not look", never "nothing archived".
 */
export async function listSnapshots(
  target: string,
  fetcher: SiteFetcher | null,
  plainFetch: typeof fetch = (input, init) => fetch(input, init),
): Promise<SnapshotList> {
  if (fetcher) {
    const response = await fetcher.fetch(cdxUrl(target), `NetRunner: the Wayback Machine's snapshots of ${hostOf(target)}, which you asked for`, { timeoutMs: 30_000 });
    if (!response.ok) throw new Error(`The Wayback Machine answered ${response.status}`);
    let rows: unknown;
    try { rows = JSON.parse(response.body || '[]'); } catch { throw new Error('The Wayback Machine\'s index did not read as JSON'); }
    return { snapshots: parseCdx(rows), complete: true, via: fetcher.via };
  }
  const response = await plainFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(target)}`);
  if (!response.ok) throw new Error(`The Wayback Machine answered ${response.status}`);
  const closest = closestSnapshot(await response.json());
  return { snapshots: closest ? [closest] : [], complete: false, note: 'Only the closest snapshot: the full list needs Starcom Uplink or the desktop app.' };
}

/** A snapshot's page, as the lines a reader sees, read through Uplink or the desktop app. */
export async function snapshotLines(snapshot: Snapshot, fetcher: SiteFetcher): Promise<string[]> {
  const response = await fetcher.fetch(snapshot.raw, `NetRunner: compare two Wayback snapshots of ${hostOf(snapshot.original)}, which you picked`, { timeoutMs: 30_000 });
  if (!response.ok) throw new Error(`The Wayback Machine answered ${response.status} for the snapshot of ${snapshot.at}`);
  return pageText(response.body);
}

const BLOCKS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL']);
const UNSEEN = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'HEAD', 'IFRAME', 'OBJECT']);

/** What a reader sees of a page: its words, a line per block, scripts and styles left out. Never rendered. */
export function pageText(html: string, parse: (html: string) => Document = (h) => new DOMParser().parseFromString(h, 'text/html')): string[] {
  const doc = parse(html);
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) { out += node.textContent ?? ''; return; }
    if (node.nodeType !== 1) return;
    const name = (node as Element).tagName.toUpperCase();
    if (UNSEEN.has(name)) return;
    const block = BLOCKS.has(name);
    if (block) out += '\n';
    node.childNodes.forEach(walk);
    if (block) out += '\n';
  };
  if (doc.body) walk(doc.body);
  return out.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export interface LineDiff {
  ops: Array<{ kind: 'same' | 'added' | 'removed'; text: string }>;
  added: number;
  removed: number;
  /** Aligned line by line; false when the pages were too large and only one-sided lines are listed. */
  exact: boolean;
}

/** What changed between two pages' lines: aligned by their longest common run, or, when too large, which lines appear on one side only. */
export function diffLines(before: string[], after: string[], maxCells = 4_000_000): LineDiff {
  const n = before.length;
  const m = after.length;
  if (n * m > maxCells) {
    const inAfter = new Set(after);
    const inBefore = new Set(before);
    const ops = [
      ...before.filter((l) => !inAfter.has(l)).map((text) => ({ kind: 'removed' as const, text })),
      ...after.filter((l) => !inBefore.has(l)).map((text) => ({ kind: 'added' as const, text })),
    ];
    return { ops, added: ops.filter((o) => o.kind === 'added').length, removed: ops.filter((o) => o.kind === 'removed').length, exact: false };
  }
  // The length of the longest common run from each pair of positions onward.
  const runs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      runs[at(i, j)] = before[i] === after[j] ? runs[at(i + 1, j + 1)] + 1 : Math.max(runs[at(i + 1, j)], runs[at(i, j + 1)]);
    }
  }
  const ops: LineDiff['ops'] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) { ops.push({ kind: 'same', text: before[i] }); i++; j++; }
    else if (j < m && (i >= n || runs[at(i, j + 1)] >= runs[at(i + 1, j)])) { ops.push({ kind: 'added', text: after[j] }); j++; }
    else { ops.push({ kind: 'removed', text: before[i] }); i++; }
  }
  // Removed before added within a change, as a reader expects.
  for (let k = 1; k < ops.length; k++) {
    if (ops[k].kind === 'removed' && ops[k - 1].kind === 'added') {
      let start = k - 1;
      while (start > 0 && ops[start - 1].kind === 'added') start--;
      const moved = ops.splice(k, 1)[0];
      ops.splice(start, 0, moved);
    }
  }
  return { ops, added: ops.filter((o) => o.kind === 'added').length, removed: ops.filter((o) => o.kind === 'removed').length, exact: true };
}

const shortAddress = (url: string) => {
  try { const { host, pathname } = new URL(url); return `${host}${pathname === '/' ? '' : pathname}`; } catch { return url; }
};

/**
 * A snapshot to file, at the person's click: a capture in the Captures inbox, to put in a case. It keeps
 * the snapshot's address, time and the Archive's digest, and names the Archive as its source. It keeps
 * nothing of the page.
 */
export function snapshotToItem(snapshot: Snapshot): CreateIntelItemInput {
  const when = formatUtcDate(Date.parse(snapshot.at), { year: true });
  const lines = [
    `A snapshot of <${snapshot.original}>, taken by the ${WAYBACK_CREDIT.name} on ${literal(snapshot.at)}: [open it](<${snapshot.replay}>).`,
    `The page answered the Archive with status ${literal(snapshot.status)}.${snapshot.digest ? ` The Archive's digest of what it kept is ${literal(snapshot.digest)}.` : ''}`,
    `Source: ${WAYBACK_CREDIT.name} (<${WAYBACK_CREDIT.url}>), for research use under its terms.`,
  ];
  return {
    title: `Wayback snapshot: ${shortAddress(snapshot.original)}, ${when}`.slice(0, 120),
    type: 'CAPTURE',
    source: 'web.archive.org',
    // An archived page is still an unassessed page: it says what the page said then, not whether it was so.
    reliability: 'F',
    confidence: 0.9,
    tags: [CAPTURE_TAG, WAYBACK_TAG],
    categories: [CAPTURE_CATEGORY],
    content: lines.join('\n\n'),
    // When the Archive took it: the time the page said this.
    collectedAt: snapshot.at,
    verified: false,
  };
}

/** Whether a case rests on a Wayback snapshot, as evidence or against it: then its published position credits the Archive. */
export function citesTheArchive(
  caseRecord: { relatedEntities: readonly string[]; contradictedBy?: readonly string[] },
  items: ReadonlyArray<{ id: string; tags: readonly string[] }>,
): boolean {
  const held = new Set([...caseRecord.relatedEntities, ...(caseRecord.contradictedBy ?? [])]);
  return items.some((item) => held.has(item.id) && item.tags.includes(WAYBACK_TAG));
}
