/**
 * A signed bundle of a case or a mission (plan item 2.4; decision D1): how
 * teammates hand work to each other, over the internal relays or as a file.
 *
 * Each record travels as an envelope: the stored record, with protected
 * fields decrypted, and the SHA-256 of its canonical JSON. That envelope is
 * what a shared team relay (D1's option A) would publish per record, so this
 * is not thrown away if one is built.
 *
 * The manifest lists every envelope's hash and the links between records,
 * and is signed with ML-DSA-65 by this node's manifest key, as Mission
 * Packages are. It travels as the content of a Nostr event signed by the
 * sender: that signature is what ties the post-quantum key to a person, and
 * what "from <name>" is read from.
 *
 * Reading refuses anything altered after signing, and says what: a record
 * changed, missing or added, a manifest changed, a post-quantum signature
 * that does not cover it, or a manifest signed by someone it does not name.
 *
 * A record the sender keeps Private is left out, and the manifest names it,
 * by type and id alone (plan item 9.13), so whoever receives it can tell a
 * record kept back from one still to arrive. Readers that predate the list
 * ignore it; it is signed with the rest.
 */
import { verifyEvent, type Event } from 'nostr-tools';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { stableStringify } from './signing';
import { decodeKeyMaterial, ML_DSA_65_PUBKEY_BYTES, ML_DSA_65_SIG_BYTES } from './signatureEncoding';
import { manifestSigningKeyStore } from '../crypto/ManifestSigningKeyStore';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { ownName } from '../identity/names';
import { APP_KINDS } from '../nostr/kindRegistry';

export const BUNDLE_FORMAT = 'starcom.bundle';
const BUNDLE_VERSION = 1;

export type BundledType = 'case' | 'mission' | 'report' | 'item';
export type BundleSubjectType = 'case' | 'mission';

export interface RecordEnvelope {
  type: BundledType;
  id: string;
  /** When the record last changed, as the record says: what "newer" is judged by. */
  updatedAt: string;
  /** SHA-256 of the record's canonical JSON. */
  sha256: string;
  record: Record<string, unknown>;
}

export type LinkRel =
  | 'evidence' | 'contradicted-by' | 'answers' | 'related-case'
  | 'cites' | 'objective-evidence' | 'follow-up-of' | 'source';

export interface BundleLink { from: string; to: string; rel: LinkRel }

/** A record the sender kept Private, and so left out: by type and id alone. */
export interface KeptBack { type: BundledType; id: string }

interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: number;
  subject: { type: BundleSubjectType; id: string };
  records: Array<Pick<RecordEnvelope, 'type' | 'id' | 'updatedAt' | 'sha256'>>;
  links: BundleLink[];
  /** Records it cites that the sender keeps Private, left out. Absent when none were. */
  withheld?: KeptBack[];
  madeAt: string;
  /** The sender's Nostr key: the manifest event must be signed by it. */
  from: string;
  /** The name the sender goes by, as they set it. A claim, ranked below any name a team gave. */
  name?: string;
  signature?: { alg: 'ml-dsa-65'; pubkey: string; sig: string };
}

/** A bundle as it is sent and saved: the signed manifest event, and the envelopes. */
export interface BundleFile {
  format: typeof BUNDLE_FORMAT;
  version: number;
  manifest: Event;
  envelopes: RecordEnvelope[];
}

export interface OpenedBundle {
  from: string;
  /** The name the sender gave themselves, if any. */
  fromName?: string;
  madeAt: string;
  subject: { type: BundleSubjectType; id: string; title: string; number: string };
  envelopes: RecordEnvelope[];
  links: BundleLink[];
  /** Links to records the bundle does not carry, shown as absent until they arrive. */
  absent: BundleLink[];
  /** Records it cites that the sender keeps Private: they will not arrive. */
  withheld: KeptBack[];
}

const hashOf = (record: unknown): string => bytesToHex(sha256(utf8ToBytes(stableStringify(record))));

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : []);

function updatedAtOf(type: BundledType, record: Record<string, unknown>): string {
  if (type === 'report') return text(record.modifiedAt) || text(record.createdAt);
  if (type === 'item') {
    const front = (record.frontmatter ?? {}) as Record<string, unknown>;
    const history = Array.isArray(front.history) ? front.history as Array<{ timestamp?: string }> : [];
    return text(record.modifiedAt) || text(history[history.length - 1]?.timestamp) || text(front.collectedAt);
  }
  return text(record.updatedAt) || text(record.createdAt);
}

/**
 * A record as an envelope. It goes through JSON first, so the hash is of
 * exactly what arrives: a Date or an undefined field would otherwise hash one
 * way here and another way on the other side.
 */
export function envelopeOf(type: BundledType, record: object): RecordEnvelope {
  const plain = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  return { type, id: text(plain.id), updatedAt: updatedAtOf(type, plain), sha256: hashOf(plain), record: plain };
}

/** Every link the records make, read from the fields that hold them. */
export function linksOf(envelopes: readonly RecordEnvelope[]): BundleLink[] {
  const links: BundleLink[] = [];
  const add = (from: string, to: string, rel: LinkRel) => { if (to) links.push({ from, to, rel }); };
  for (const { type, id, record: r } of envelopes) {
    if (type === 'case') {
      texts(r.relatedEntities).forEach((to) => add(id, to, 'evidence'));
      texts(r.contradictedBy).forEach((to) => add(id, to, 'contradicted-by'));
      (Array.isArray(r.requirements) ? r.requirements as Array<{ answeredBy?: unknown }> : [])
        .forEach((req) => texts(req.answeredBy).forEach((to) => add(id, to, 'answers')));
      texts(r.relatedCases).forEach((to) => add(id, to, 'related-case'));
    } else if (type === 'mission') {
      texts(r.relatedReports).forEach((to) => add(id, to, 'cites'));
      texts(r.relatedCases).forEach((to) => add(id, to, 'related-case'));
      (Array.isArray(r.objectives) ? r.objectives as Array<{ evidenceRef?: unknown }> : [])
        .forEach((o) => add(id, text(o.evidenceRef), 'objective-evidence'));
      add(id, text((r.metadata as Record<string, unknown> | undefined)?.followUpOf), 'follow-up-of');
    } else if (type === 'report') {
      texts(r.sourceIntel).forEach((to) => add(id, to, 'source'));
    }
  }
  return links;
}

const keptBackOf = (withheld: readonly KeptBack[]): KeptBack[] => withheld.map(({ type, id }) => ({ type, id }));

/** What a manifest will list for these envelopes, before it is signed: for a review to fingerprint. */
export const stableSubject = (
  subject: { type: BundleSubjectType; id: string },
  envelopes: readonly RecordEnvelope[],
  withheld: readonly KeptBack[] = [],
) => ({
  subject,
  records: envelopes.map(({ type, id, updatedAt, sha256: hash }) => ({ type, id, updatedAt, sha256: hash })),
  ...(withheld.length > 0 ? { withheld: keptBackOf(withheld) } : {}),
});

const digestOf = (manifest: BundleManifest): Uint8Array => {
  const { signature: _signature, ...signed } = manifest;
  return sha256(utf8ToBytes(stableStringify(signed)));
};

/**
 * Signs a bundle of these envelopes, about this subject, as the person's
 * signer and this node's manifest key. What was kept back is named by type
 * and id alone, whatever else the caller holds about it.
 */
export async function makeBundle(
  subject: { type: BundleSubjectType; id: string },
  envelopes: RecordEnvelope[],
  withheld: readonly KeptBack[] = [],
): Promise<BundleFile> {
  if (!envelopes.some((e) => e.type === subject.type && e.id === subject.id)) {
    throw new Error(`The bundle does not carry its own ${subject.type}.`);
  }
  const from = await nostrIdentityService.ensureSigner('sending a bundle');
  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    subject,
    records: envelopes.map(({ type, id, updatedAt, sha256: hash }) => ({ type, id, updatedAt, sha256: hash })),
    links: linksOf(envelopes),
    ...(withheld.length > 0 ? { withheld: keptBackOf(withheld) } : {}),
    madeAt: new Date().toISOString(),
    from,
    ...(ownName() ? { name: ownName()! } : {}),
  };
  const keys = await manifestSigningKeyStore.getOrCreate(() => ml_dsa65.keygen());
  manifest.signature = {
    alg: 'ml-dsa-65',
    pubkey: bytesToHex(keys.publicKey),
    sig: bytesToHex(ml_dsa65.sign(digestOf(manifest), keys.secretKey)),
  };
  const event = await nostrIdentityService.asSigner().signEvent({
    kind: APP_KINDS.RECORD_BUNDLE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(manifest),
  });
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, manifest: event, envelopes };
}

const NOT_A_BUNDLE = 'This is not a Starcom bundle.';

const BUNDLED_TYPES: readonly BundledType[] = ['case', 'mission', 'report', 'item'];

/** The manifest's list of what was kept back, as far as it is one. */
function keptBackIn(value: unknown): KeptBack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const { type, id } = (entry ?? {}) as { type?: unknown; id?: unknown };
    return BUNDLED_TYPES.includes(type as BundledType) && typeof id === 'string' && id !== '' ? [{ type: type as BundledType, id }] : [];
  });
}

function postQuantumHolds(manifest: BundleManifest): boolean {
  const sig = manifest.signature;
  if (!sig || sig.alg !== 'ml-dsa-65') return false;
  try {
    return ml_dsa65.verify(
      decodeKeyMaterial(sig.sig, ML_DSA_65_SIG_BYTES),
      digestOf(manifest),
      decodeKeyMaterial(sig.pubkey, ML_DSA_65_PUBKEY_BYTES),
    );
  } catch {
    return false;
  }
}

/** Reads a bundle as it arrived, refusing it, in words, if anything in it was changed after signing. */
export async function readBundle(input: unknown): Promise<{ bundle: OpenedBundle } | { refused: string }> {
  const file = input as Partial<BundleFile> | null;
  if (!file || typeof file !== 'object' || file.format !== BUNDLE_FORMAT || !file.manifest || !Array.isArray(file.envelopes)) {
    return { refused: NOT_A_BUNDLE };
  }
  if (file.version !== BUNDLE_VERSION) return { refused: `This bundle is version ${String(file.version)}, which this Starcom cannot read yet.` };

  const event = file.manifest;
  if (event.kind !== APP_KINDS.RECORD_BUNDLE || !verifyEvent(event)) {
    return { refused: "The bundle's signature does not match its manifest: something in it was changed. Ask for it again." };
  }
  let manifest: BundleManifest;
  try { manifest = JSON.parse(event.content); } catch { return { refused: NOT_A_BUNDLE }; }
  if (manifest.format !== BUNDLE_FORMAT || !Array.isArray(manifest.records) || !Array.isArray(manifest.links)) return { refused: NOT_A_BUNDLE };
  if (manifest.from !== event.pubkey) {
    return { refused: 'The manifest is not signed by the person it names as its sender, so who sent it cannot be told.' };
  }
  if (!postQuantumHolds(manifest)) {
    return { refused: "The manifest's post-quantum signature does not cover what it says: something in it was changed. Ask for it again." };
  }

  const listed = new Map(manifest.records.map((r) => [`${r.type}:${r.id}`, r]));
  const seen = new Set<string>();
  for (const envelope of file.envelopes) {
    const key = `${envelope.type}:${envelope.id}`;
    const entry = listed.get(key);
    if (!entry || seen.has(key)) return { refused: `The bundle carries a record not listed in its manifest (${envelope.type} ${envelope.id}): it was added after signing.` };
    seen.add(key);
    const record = envelope.record ?? {};
    if (record.id !== entry.id || hashOf(record) !== entry.sha256 || envelope.updatedAt !== entry.updatedAt) {
      const name = text(record.title) || text((record.frontmatter as Record<string, unknown> | undefined)?.title) || entry.id;
      return { refused: `"${name}" was changed after the bundle was signed. Ask for it again.` };
    }
  }
  const missing = manifest.records.filter((r) => !seen.has(`${r.type}:${r.id}`));
  if (missing.length > 0) return { refused: `${missing.length} record${missing.length === 1 ? ' is' : 's are'} missing from the bundle. Ask for it again.` };

  const envelopes = manifest.records.map((r) => file.envelopes!.find((e) => e.type === r.type && e.id === r.id)!);
  const subjectEnvelope = envelopes.find((e) => e.type === manifest.subject?.type && e.id === manifest.subject?.id);
  if (!subjectEnvelope) return { refused: NOT_A_BUNDLE };
  const carried = new Set(envelopes.map((e) => e.id));
  const withheld = keptBackIn(manifest.withheld);
  const keptBack = new Set(withheld.map((w) => w.id));
  return {
    bundle: {
      from: event.pubkey,
      ...(typeof manifest.name === 'string' && manifest.name.trim() ? { fromName: manifest.name.trim() } : {}),
      madeAt: manifest.madeAt,
      subject: {
        ...manifest.subject,
        title: text(subjectEnvelope.record.title),
        number: text(subjectEnvelope.record.caseNumber) || text(subjectEnvelope.record.missionNumber),
      },
      envelopes,
      links: manifest.links,
      absent: manifest.links.filter((l) => !carried.has(l.to) && !keptBack.has(l.to)),
      withheld,
    },
  };
}
