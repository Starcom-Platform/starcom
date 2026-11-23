/**
 * Completing an evidence capture's timestamps (decision D-EX, EX18, W8c follow-up), at the person's click.
 *
 * A proof Uplink made is pending: each calendar promised to anchor it in Bitcoin, usually within hours.
 * Completing it asks each calendar for the part that reaches a Bitcoin block, lays it over the proof,
 * and checks that block's merkle root with two independent block explorers. Only when they agree is the
 * evidence called proven to have existed by the block's time. The completed proofs are kept beside the
 * signed custody record, which is never changed: they are proofs about the same files.
 *
 * - **Where it goes.** Only to the calendars Starcom knows: a proof's own data never chooses an address.
 *   The calendars receive the blinded commitment they already hold; the explorers, a block's height.
 *   Both answer any site, so this runs in the app, with or without Uplink.
 * - **What it says.** "No finished proof yet" while the calendars give nothing complete, which from a
 *   browser covers "still pending" and "could not be read" alike, since the calendars' "not yet" carries
 *   no CORS header; "could not" when every calendar refused, or no explorer answered; "does NOT match"
 *   when an explorer shows another merkle root. Never "proven" on a calendar's word alone.
 */
import { base64ToBytes, bytesToBase64 } from './bytes';
import type { Capture, EvidenceFileName } from './protocol';
import { OTS_CALENDARS, attachUpgrade, bitcoinAnchors, detachedProof, pendingCommitments, readDetachedProof } from './uplink/opentimestamps';

/** A capture's timestamps, completed and checked against Bitcoin. */
export interface AnchoredTimestamps {
  /** When the block was checked, UTC, ISO 8601 ending Z. */
  checkedAt: string;
  block: {
    height: number;
    hash: string;
    /** As block explorers show it. */
    merkleRoot: string;
    /** UTC, ISO 8601 ending Z: the files existed by then. */
    minedAt: string;
    /** The explorers that showed the same merkle root. */
    checkedWith: string[];
  };
  /** Each file's completed proof, base64 of its .ots file. */
  proofs: Partial<Record<EvidenceFileName, string>>;
}

/** A block as one explorer shows it. */
export interface BlockSeen { source: string; hash: string; merkleRoot: string; minedAt: string }

export interface CompletionDeps {
  /**
   * A calendar's completed timestamp at this address. Null when it has none to give: still pending, or,
   * from a browser, not readable at all, since the calendars' "not yet" carries no CORS header and a
   * browser cannot tell it from a failure. Throws only for an answer read and refused.
   */
  calendar(url: string): Promise<Uint8Array | null>;
  /** The block at a height, as each explorer that answered shows it. */
  blocks(height: number): Promise<BlockSeen[]>;
  sha256(bytes: Uint8Array): Promise<Uint8Array>;
  now(): Date;
}

export type Completion = { anchored: AnchoredTimestamps } | { pending: string } | { failed: string };

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const KNOWN: ReadonlySet<string> = new Set(OTS_CALENDARS);
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function completeTimestamps(capture: Capture, d: CompletionDeps): Promise<Completion> {
  const files = (capture.files ?? []).filter((f) => capture.timestamps?.proofs[f.name]);
  if (!files.length) return { failed: 'This evidence has no timestamp proofs.' };

  const proofs: Array<{ name: EvidenceFileName; fileHash: Uint8Array; timestamp: ReturnType<typeof readDetachedProof>['timestamp'] }> = [];
  for (const f of files) {
    let read: ReturnType<typeof readDetachedProof>;
    try { read = readDetachedProof(base64ToBytes(capture.timestamps!.proofs[f.name]!)); } catch (e) { return { failed: `The proof for ${f.name} could not be read: ${said(e)}` }; }
    if (hex(read.fileHash) !== f.sha256) return { failed: `The proof for ${f.name} is for another file.` };
    proofs.push({ name: f.name, ...read });
  }

  // Each calendar asked once per commitment: the files share their way to the calendars.
  const answers = new Map<string, Uint8Array | null>();
  const unreachable: string[] = [];
  for (const p of proofs) {
    for (const { uri, commitment } of await pendingCommitments(p.timestamp, p.fileHash, d.sha256)) {
      if (!KNOWN.has(uri)) continue;
      const url = `${uri}/timestamp/${hex(commitment)}`;
      if (!answers.has(url)) {
        try { answers.set(url, await d.calendar(url)); } catch (e) { answers.set(url, null); unreachable.push(said(e)); }
      }
      const answer = answers.get(url);
      if (answer) await attachUpgrade(p.timestamp, p.fileHash, commitment, answer, d.sha256).catch(() => false);
    }
  }

  const anchors = await Promise.all(proofs.map((p) => bitcoinAnchors(p.timestamp, p.fileHash, d.sha256)));
  if (anchors.some((a) => a.length === 0)) {
    if (answers.size > 0 && unreachable.length === answers.size) return { failed: `No calendar answered: ${unreachable[0]}` };
    return { pending: 'No finished proof yet: Bitcoin may not have confirmed it, or a calendar could not be read. Try again in a few hours.' };
  }

  // Every block any file reaches, each checked with the explorers before anything is called proven.
  const distinct = anchors.flat().filter((a, i, all) => all.findIndex((b) => b.height === a.height && b.merkleRoot === a.merkleRoot) === i);
  const checked: Array<{ height: number; merkleRoot: string; seen: BlockSeen[] }> = [];
  for (const a of distinct) {
    const seen = await d.blocks(a.height);
    if (!seen.length) return { failed: `Could not check block ${a.height}: no block explorer answered.` };
    const wrong = seen.find((b) => b.merkleRoot.toLowerCase() !== a.merkleRoot);
    if (wrong) return { failed: `The proof does NOT match block ${a.height} as ${wrong.source} shows it.` };
    checked.push({ ...a, seen });
  }
  const earliest = checked.sort((a, b) => a.height - b.height)[0];
  return {
    anchored: {
      checkedAt: d.now().toISOString(),
      block: {
        height: earliest.height, hash: earliest.seen[0].hash, merkleRoot: earliest.merkleRoot, minedAt: earliest.seen[0].minedAt,
        checkedWith: earliest.seen.map((s) => s.source),
      },
      proofs: Object.fromEntries(proofs.map((p) => [p.name, bytesToBase64(detachedProof(p.fileHash, p.timestamp))])),
    },
  };
}

/** The block explorers asked, two independent operators (terms read 2026-10-12, record D-L). */
const EXPLORERS = [
  { source: 'mempool.space', base: 'https://mempool.space/api' },
  { source: 'blockstream.info', base: 'https://blockstream.info/api' },
] as const;

/** A calendar answer is small; one larger than this is not a timestamp. */
const MAX_ANSWER = 64 * 1024;

const timed = async (url: string, init: RequestInit = {}) => {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 15_000);
  try { return await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', signal: stop.signal }); } finally { clearTimeout(timer); }
};

/** The calendars and explorers as the browser reaches them: both answer any site. */
export const browserCompletion = (): CompletionDeps => ({
  async calendar(url) {
    let response: Response;
    // A calendar's "not yet" (404) carries no CORS header, so the browser reports it as a failed fetch.
    try { response = await timed(url, { headers: { Accept: 'application/vnd.opentimestamps.v1' } }); } catch { return null; }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_ANSWER) throw new Error(`${new URL(url).host} answered with more than a timestamp`);
    return bytes;
  },
  async blocks(height) {
    const seen = await Promise.all(EXPLORERS.map(async ({ source, base }): Promise<BlockSeen | null> => {
      try {
        const hash = (await (await timed(`${base}/block-height/${height}`)).text()).trim();
        if (!/^[0-9a-f]{64}$/.test(hash)) return null;
        const block = await (await timed(`${base}/block/${hash}`)).json() as { merkle_root?: string; timestamp?: number };
        if (typeof block.merkle_root !== 'string' || typeof block.timestamp !== 'number') return null;
        return { source, hash, merkleRoot: block.merkle_root, minedAt: new Date(block.timestamp * 1000).toISOString().replace('.000Z', 'Z') };
      } catch {
        return null;
      }
    }));
    return seen.filter((s): s is BlockSeen => s !== null);
  },
  sha256: async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  now: () => new Date(),
});
