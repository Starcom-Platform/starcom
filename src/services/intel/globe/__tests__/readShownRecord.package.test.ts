/**
 * A received package on the globe (plan item 9.14, decision G6): the reports
 * it cites, found among what its signer published, and, offered beside it,
 * everything that key published, labelled as that.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readShownRecord } from '../readShownRecord';
import { intelWorkspaceManager } from '../../IntelWorkspaceManager';
import { nip19 } from 'nostr-tools';

const MECHA = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const report = (id: string, title: string, author: string, geo?: { lat: number; lon: number }) => ({
  id, title, type: 'INTEL_REPORT', summary: '', content: `${title}.`, conclusions: [], recommendations: [], analysisType: 'OSINT',
  methodology: [], confidence: 0.6, sourceIntel: [], author, contributors: [], createdAt: '2026-09-28T10:00:00.000Z',
  modifiedAt: '2026-09-28T10:00:00.000Z', targetAudience: [],
  metadata: { history: [{ action: 'IMPORTED', timestamp: '2026-09-28T11:00:00.000Z', user: 'nostr' }], ...(geo ? { geo } : {}) },
});

beforeAll(async () => {
  await intelWorkspaceManager.ensureInitialized();
  await intelWorkspaceManager.addReport(report(`30023:${MECHA}:starcom-intel-ic-1`, 'Vienna alert', MECHA, { lat: 48.2, lon: 16.4 }));
  await intelWorkspaceManager.addReport(report(`30023:${MECHA}:starcom-intel-ic-2`, 'Desk note', MECHA));
  await intelWorkspaceManager.addReport(report(`30023:${MECHA}:starcom-intel-ic-3`, 'Lisbon alert', MECHA, { lat: 38.7, lon: -9.1 }));
  await intelWorkspaceManager.addReport(report(`30023:${OTHER}:starcom-intel-ic-1`, 'Someone else', OTHER, { lat: 1, lon: 1 }));
});

describe('a received package, shown', () => {
  it('draws the reports it cites that its signer published, and says which it could not find', async () => {
    const read = await readShownRecord({ kind: 'package', id: 'evt-1', signer: MECHA, name: 'Harm reduction at Nova', cites: ['ic-1', 'ic-2', 'ic-9'] });
    if (read.status !== 'ready') throw new Error(read.status);
    expect(read.label).toBe('Harm reduction at Nova');
    expect(read.placement.markers.map((m) => m.pubkey)).toEqual([`30023:${MECHA}:starcom-intel-ic-1`]);
    expect(read.placement.notDrawn.byReason).toEqual({ 'no-coordinates': 1 });
    expect(read.citations).toEqual({ cited: 3, found: 2, unresolved: ['ic-9'] });
  });
});

describe('what a key published, shown', () => {
  it("draws everything that key published, and nothing another key did, under the key's name", async () => {
    const read = await readShownRecord({ kind: 'publisher', id: MECHA });
    if (read.status !== 'ready') throw new Error(read.status);
    const npub = nip19.npubEncode(MECHA);
    expect(read.label).toBe(`${npub.slice(0, 14)}…${npub.slice(-6)}`);
    expect(read.placement.markers.map((m) => m.pubkey)).toEqual([`30023:${MECHA}:starcom-intel-ic-1`, `30023:${MECHA}:starcom-intel-ic-3`]);
    expect(read.published).toBe(3);
  });
});
