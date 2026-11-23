/**
 * Export all my work (plan item 9.13b, decision G8d): every case, mission,
 * report and intel item kept here, Private included, in one file only the
 * person's own key can open.
 *
 * Why it exists: 9.13 made a Private case or mission stay put (G8, G8c), and
 * that closed the only way a person could take their own work with them,
 * which R4 asks interns to do before their access ends. A copy sealed to its
 * owner hands nothing to anyone else, so the rule it keeps is the rule
 * Private states.
 *
 * How it is sealed: the records, as JSON, under AES-256-GCM with a key made
 * for this copy (the cipher 9.11 uses for each message), and that key sealed
 * with NIP-44 by the owner to themselves. Opening it needs the same key,
 * through the same signer: this browser's key, or an extension that can
 * encrypt. GCM refuses anything changed after it was made.
 *
 * What it holds: records as a bundle carries them, protected fields readable,
 * since the copy protects them on the way and a device importing it encrypts
 * them at rest again. Not copied: reports the relay feed stored, which others
 * published and which stay on their relays; sample material; and a protected
 * record whose key this browser no longer holds, which is named instead.
 */
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { KeyLockedError } from '../../identity/keyLock';
import { pqCryptoService } from '../../crypto/PQCryptoService';
import { envelopeOf, type BundledType, type RecordEnvelope } from '../../exchange/bundle';
import { fromRelayFeed } from '../bundles/bundleDistribution';
import { nip19 } from 'nostr-tools';

export const COPY_FORMAT = 'starcom.copy';
const COPY_VERSION = 1;

export interface WorkCopyFile {
  format: typeof COPY_FORMAT;
  version: number;
  /** The key it is sealed to: only someone holding it can open the copy. */
  owner: string;
  madeAt: string;
  /** This copy's data key, sealed with NIP-44 by the owner to themselves. */
  key: string;
  /** The records as JSON, AES-256-GCM with the IV first, base64. */
  data: string;
}

export interface CopyLeftOut {
  /** Reports others published, which the relay feed stored. */
  fromRelays: number;
  sample: number;
  /** Titles of protected records whose key this browser no longer holds. */
  unreadable: string[];
}

export interface OpenedCopy {
  owner: string;
  madeAt: string;
  envelopes: RecordEnvelope[];
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const BUNDLED_TYPES: readonly BundledType[] = ['case', 'mission', 'report', 'item'];

/** Everything this workspace holds that is the person's own work, readable, and what was left out. */
export async function collectMyWork(): Promise<{ envelopes: RecordEnvelope[]; leftOut: CopyLeftOut }> {
  await intelWorkspaceManager.ensureInitialized();
  const envelopes: RecordEnvelope[] = [];
  const leftOut: CopyLeftOut = { fromRelays: 0, sample: 0, unreadable: [] };

  for (const record of intelWorkspaceManager.getCases()) {
    if (record.sample) { leftOut.sample += 1; continue; }
    const description = await intelWorkspaceManager.decryptCaseDescription(record.id);
    if (description === null) { leftOut.unreadable.push(record.title); continue; }
    envelopes.push(envelopeOf('case', { ...record, description }));
  }
  for (const record of intelWorkspaceManager.getMissions()) {
    if (record.sample) { leftOut.sample += 1; continue; }
    const briefing = await intelWorkspaceManager.decryptMissionBriefing(record.id);
    if (briefing === null) { leftOut.unreadable.push(record.title); continue; }
    envelopes.push(envelopeOf('mission', { ...record, briefing }));
  }
  for (const report of intelWorkspaceManager.getReports()) {
    const metadata = (report.metadata ?? {}) as { sample?: unknown; history?: Array<{ action?: string; user?: string }> };
    if (fromRelayFeed({ history: metadata.history })) { leftOut.fromRelays += 1; continue; }
    if (metadata.sample === true) { leftOut.sample += 1; continue; }
    const content = await intelWorkspaceManager.decryptReportContent(report.id);
    if (content === null) { leftOut.unreadable.push(report.title); continue; }
    envelopes.push(envelopeOf('report', { ...report, content }));
  }
  for (const { id } of intelWorkspaceManager.getIntelItems()) {
    const item = intelWorkspaceManager.getStoredIntelItem(id);
    if (item) envelopes.push(envelopeOf('item', item));
  }
  return { envelopes, leftOut };
}

/** The copy, sealed to the person's key, with what it holds and what it left out. */
export async function makeWorkCopy(): Promise<{ file: WorkCopyFile; holds: Record<BundledType, number>; leftOut: CopyLeftOut }> {
  const owner = await nostrIdentityService.ensureSigner('keeping a copy of your work');
  const { envelopes, leftOut } = await collectMyWork();
  const dataKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const data = toBase64(await pqCryptoService.encryptData(new TextEncoder().encode(JSON.stringify({ records: envelopes })), dataKey));
  const key = await nostrIdentityService.nip44Encrypt(owner, toBase64(dataKey), 'sealing a copy of your work');
  const holds = { case: 0, mission: 0, report: 0, item: 0 } as Record<BundledType, number>;
  envelopes.forEach((e) => { holds[e.type] += 1; });
  return {
    file: { format: COPY_FORMAT, version: COPY_VERSION, owner, madeAt: new Date().toISOString(), key, data },
    holds,
    leftOut,
  };
}

const NOT_A_COPY = 'This is not a copy of Starcom work.';
const CHANGED = 'This copy was changed after it was made, so it cannot be opened.';

const shortNpub = (pubkey: string): string => {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return pubkey.slice(0, 12);
  }
};

const isEnvelope = (value: unknown): value is RecordEnvelope => {
  const e = value as Partial<RecordEnvelope> | null;
  return !!e && typeof e === 'object' && BUNDLED_TYPES.includes(e.type as BundledType)
    && typeof e.id === 'string' && e.id !== '' && !!e.record && typeof e.record === 'object';
};

/** Opens a copy with this browser's signer, or says, in words, why it cannot. */
export async function openWorkCopy(input: unknown): Promise<{ copy: OpenedCopy } | { refused: string }> {
  const file = input as Partial<WorkCopyFile> | null;
  if (!file || typeof file !== 'object' || file.format !== COPY_FORMAT) return { refused: NOT_A_COPY };
  if (file.version !== COPY_VERSION) return { refused: `This copy is version ${String(file.version)}, which this Starcom cannot open yet.` };
  if (typeof file.owner !== 'string' || typeof file.key !== 'string' || typeof file.data !== 'string') return { refused: NOT_A_COPY };

  const { pubkey: me } = await nostrIdentityService.whoAmI();
  if (!me) return { refused: 'This browser holds no key, so it cannot open a copy. Bring the key it is sealed to under Your key.' };
  if (me !== file.owner) {
    return { refused: `This copy is sealed to another key, ${shortNpub(file.owner)}. Open it where that key is, or bring that key here under Your key.` };
  }

  let dataKey: Uint8Array;
  try {
    // Opening a copy is the person's own act, so a locked key is asked for (D-KL).
    dataKey = fromBase64(await nostrIdentityService.nip44Decrypt(file.owner, file.key, 'opening a copy of your work'));
    if (dataKey.length !== 32) return { refused: CHANGED };
  } catch (e) {
    // A key still locked says so, rather than calling the file changed.
    if (e instanceof KeyLockedError) return { refused: e.message };
    return { refused: CHANGED };
  }
  let records: unknown;
  try {
    const plain = await pqCryptoService.decryptData(fromBase64(file.data), dataKey);
    records = (JSON.parse(new TextDecoder().decode(plain)) as { records?: unknown }).records;
  } catch {
    return { refused: CHANGED };
  }
  if (!Array.isArray(records) || !records.every(isEnvelope)) return { refused: NOT_A_COPY };
  return { copy: { owner: file.owner, madeAt: typeof file.madeAt === 'string' ? file.madeAt : '', envelopes: records } };
}
