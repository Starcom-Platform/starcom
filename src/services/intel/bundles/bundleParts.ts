/**
 * A bundle in parts small enough for one gift wrap each (plan item 2.4).
 *
 * NIP-44 encrypts at most 65,535 bytes, and a wrap holds a seal that holds
 * the part, encrypted twice, so a part stays near two thirds of that. Part 0
 * is the signed manifest; the rest are the envelopes, packed in order. Each
 * part names its bundle (the manifest's id) and its place, so parts arriving
 * in any order, or among another bundle's, come back whole or not at all.
 * Whether what comes back can be trusted is readBundle's to say.
 */
import type { Event } from 'nostr-tools';
import { APP_KINDS } from '../../nostr/kindRegistry';
import { BUNDLE_FORMAT, type BundleFile, type RecordEnvelope } from '../../exchange/bundle';

/** Bytes of a part's JSON, leaving room for the rumor around it and both encryptions. */
export const PART_BUDGET = 44_000;

export interface PartTemplate { kind: number; tags: string[][]; content: string }

export class TooLargeForARelay extends Error {}

const bytes = (text: string): number => new TextEncoder().encode(text).length;

const template = (bundleId: string, index: number, of: number, body: unknown): PartTemplate => ({
  kind: APP_KINDS.RECORD_BUNDLE_PART,
  tags: [['bundle', bundleId], ['part', String(index), String(of)]],
  content: JSON.stringify(body),
});

const fits = (body: unknown): boolean => bytes(JSON.stringify(template('0'.repeat(64), 999, 999, body))) <= PART_BUDGET;

const nameOf = (envelope: RecordEnvelope): string => {
  const r = envelope.record;
  const title = typeof r.title === 'string' ? r.title : (r.frontmatter as { title?: unknown } | undefined)?.title;
  return typeof title === 'string' && title ? `"${title}"` : envelope.id;
};

export function partsOf(file: BundleFile): PartTemplate[] {
  if (!fits({ manifest: file.manifest })) {
    throw new TooLargeForARelay('This bundle lists too many records to send over a relay. Export it as a file instead.');
  }
  const groups: RecordEnvelope[][] = [];
  let group: RecordEnvelope[] = [];
  for (const envelope of file.envelopes) {
    if (fits({ envelopes: [...group, envelope] })) { group.push(envelope); continue; }
    if (!fits({ envelopes: [envelope] })) {
      throw new TooLargeForARelay(`${nameOf(envelope)} is too large to send over a relay. Export the bundle as a file instead.`);
    }
    groups.push(group);
    group = [envelope];
  }
  if (group.length > 0) groups.push(group);

  const of = groups.length + 1;
  const bundleId = file.manifest.id;
  return [
    template(bundleId, 0, of, { manifest: file.manifest }),
    ...groups.map((envelopes, i) => template(bundleId, i + 1, of, { envelopes })),
  ];
}

/** Says, before anything is signed, which record is too large to go over a relay. */
export function checkFitsARelay(envelopes: readonly RecordEnvelope[]): void {
  const tooLarge = envelopes.find((envelope) => !fits({ envelopes: [envelope] }));
  if (tooLarge) throw new TooLargeForARelay(`${nameOf(tooLarge)} is too large to send over a relay. Export the bundle as a file instead.`);
}

/** The bundle a part belongs to, and its place, when it says so. */
export function placeOf(part: { tags: string[][] }): { bundleId: string; index: number; of: number } | null {
  const bundleId = part.tags.find((t) => t[0] === 'bundle')?.[1];
  const place = part.tags.find((t) => t[0] === 'part');
  const index = Number(place?.[1]);
  const of = Number(place?.[2]);
  if (!bundleId || !Number.isInteger(index) || !Number.isInteger(of) || index < 0 || of < 1 || index >= of) return null;
  return { bundleId, index, of };
}

/** One bundle's parts, whole: or null while any is missing or they disagree. */
export function assemble(parts: Array<{ tags: string[][]; content: string }>): BundleFile | null {
  const placed = parts.map((part) => ({ part, place: placeOf(part) }));
  const first = placed[0]?.place;
  if (!first || placed.some(({ place }) => !place || place.bundleId !== first.bundleId || place.of !== first.of)) return null;
  const byIndex = new Map(placed.map(({ part, place }) => [place!.index, part]));
  if (byIndex.size !== first.of) return null;
  try {
    const { manifest } = JSON.parse(byIndex.get(0)!.content) as { manifest: Event };
    const envelopes: RecordEnvelope[] = [];
    for (let i = 1; i < first.of; i += 1) envelopes.push(...(JSON.parse(byIndex.get(i)!.content) as { envelopes: RecordEnvelope[] }).envelopes);
    return { format: BUNDLE_FORMAT, version: 1, manifest, envelopes };
  } catch {
    return null;
  }
}
