/**
 * A case's evidence fingerprints (decision D-EX, EX23): every evidence file's hash, from both of the
 * case's lists, each once and sorted; records with no evidence, or not held here, add none.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { evidenceFingerprintsFor } from '../evidenceFingerprints';
import type { KeptCustody } from '../keepEvidence';

const kept = (...hashes: string[]) => ({ captureId: 'c', capture: { id: 'c', kind: 'evidence', at: '', page: { url: '' }, files: hashes.map((sha256) => ({ name: 'text.txt', type: '', size: 1, sha256 })) } }) as KeptCustody;

describe('evidenceFingerprintsFor', () => {
  it('gathers every evidence file\'s hash from both lists, each once, sorted', async () => {
    const records: Record<string, KeptCustody> = { e1: kept('cc', 'aa'), e2: kept('bb', 'aa'), against: kept('dd') };
    const prints = await evidenceFingerprintsFor({ relatedEntities: ['e1', 'report-1', 'e2'], contradictedBy: ['against', 'gone'] }, async (id) => {
      if (id === 'gone') throw new Error('unreadable');
      return records[id];
    });
    expect(prints).toEqual(['aa', 'bb', 'cc', 'dd']);
  });
});
