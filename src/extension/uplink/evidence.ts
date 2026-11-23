/**
 * An evidence capture as Uplink makes it (decision D-EX, E2, W8; EX14, EX15, EX21, EX22): the page's
 * picture, its HTML and its text, read at the person's click with the access that click gives, each
 * with its SHA-256. Pure: the background hands in what the browser gave it.
 *
 * The picture is scaled to one width (EX22), so its size tells nothing of the capturer's screen,
 * window or zoom; the capture says it was scaled. Each file waits in Uplink's storage under a key of
 * its own, apart from the queue, until Starcom has taken it into its own storage beside the case,
 * checked its hash, and kept it: so removing Uplink loses none of it.
 */
import type { Capture, EvidenceFileName } from '../protocol';

/** Every evidence picture's width, in pixels (EX22). */
export const EVIDENCE_WIDTH = 1280;
/** The most HTML or text an evidence capture keeps; a larger page is refused, never cut. */
export const EVIDENCE_LIMIT_BYTES = 25_000_000;

const NOT_THE_WEB = 'Uplink captures from web pages, not the browser\'s own pages or your files';

export interface PageRead {
  url: string;
  title: string;
  html: string;
  text: string;
}

/** The picture's size once scaled to EVIDENCE_WIDTH, keeping its shape. */
export function scaledSize(width: number, height: number): { width: number; height: number } {
  return { width: EVIDENCE_WIDTH, height: Math.max(1, Math.round((height * EVIDENCE_WIDTH) / width)) };
}

/** Where each of a capture's files waits in Uplink's storage. */
export function fileKeysOf(capture: Pick<Capture, 'id'> & { files?: ReadonlyArray<{ name: string }> }): string[] {
  return (capture.files ?? []).map((f) => fileKey(capture.id, f.name));
}
export const fileKey = (captureId: string, name: string) => `file:${captureId}:${name}`;

const onTheWeb = (url: string) => {
  try { const { protocol } = new URL(url); return protocol === 'https:' || protocol === 'http:'; } catch { return false; }
};

/** An evidence capture and its files, or why there is none. `picture` is already scaled. */
export async function evidenceFromPage(
  page: PageRead,
  picture: Uint8Array,
  at: number,
  id: string,
  sha256: (bytes: Uint8Array) => Promise<string>,
): Promise<{ capture: Capture; files: Record<EvidenceFileName, Uint8Array> } | { refused: string }> {
  if (!onTheWeb(page.url)) return { refused: NOT_THE_WEB };
  const encoder = new TextEncoder();
  const html = encoder.encode(page.html);
  const text = encoder.encode(page.text);
  if (html.length > EVIDENCE_LIMIT_BYTES || text.length > EVIDENCE_LIMIT_BYTES) {
    return { refused: `This page is larger than Uplink keeps as evidence (${EVIDENCE_LIMIT_BYTES / 1_000_000} MB)` };
  }
  const files: Record<EvidenceFileName, Uint8Array> = { 'screenshot.png': picture, 'page.html': html, 'text.txt': text };
  const types: Record<EvidenceFileName, string> = { 'screenshot.png': 'image/png', 'page.html': 'text/html', 'text.txt': 'text/plain' };
  const names = Object.keys(files) as EvidenceFileName[];
  const capture: Capture = {
    id, kind: 'evidence', at: new Date(at).toISOString(),
    page: { url: page.url, ...(page.title ? { title: page.title } : {}) },
    scaledTo: EVIDENCE_WIDTH,
    files: await Promise.all(names.map(async (name) => ({ name, type: types[name], size: files[name].length, sha256: await sha256(files[name]) }))),
  };
  return { capture, files };
}
