/**
 * The evidence fingerprints of a case (decision D-EX, EX23): the SHA-256 of every evidence file it
 * holds, as evidence or against it, read from where Starcom keeps evidence. A case published from a
 * browser that does not hold its evidence publishes none, rather than guessing.
 */
import { evidenceStore } from './evidenceStore';
import type { KeptCustody } from './keepEvidence';

export async function evidenceFingerprintsFor(
  caseRecord: { relatedEntities: readonly string[]; contradictedBy?: readonly string[] },
  getRecord: (itemId: string) => Promise<KeptCustody | undefined> = evidenceStore.getRecord,
): Promise<string[]> {
  const ids = [...caseRecord.relatedEntities, ...(caseRecord.contradictedBy ?? [])];
  const records = await Promise.all(ids.map((id) => getRecord(id).catch(() => undefined)));
  return [...new Set(records.flatMap((r) => r?.capture.files?.map((f) => f.sha256) ?? []))].sort();
}
