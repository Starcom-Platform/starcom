/**
 * The Mission Package review says what the package cites in its tags, and how
 * many linked reports it does not cite, and why (decision D-MX: MX22, MX24).
 */
import { describe, it, expect } from 'vitest';
import { showManifest } from '../missions';
import type { PackageManifest } from '../../exchange/types';

const A = 'a'.repeat(64);
const manifest = {
  id: 'm1', name: 'Cooling centres', description: 'Which are open', author: 'Kestrel', license: 'CC-BY',
  version: '1', createdAt: '2026-10-06T00:00:00Z', reports: [], intel: [], assets: [], visibility: 'public',
  metadata: { relatedReportCount: 4, relatedCaseCount: 0 },
} as unknown as PackageManifest;

describe('the Mission Package review', () => {
  it('lists each observation it cites, by event and relay, and the reports held back', () => {
    const fields = showManifest(manifest, [{ eventId: A, relay: 'wss://relay.example' }], 2).fields;
    const cites = fields.find((f) => f.label === 'Cites');
    expect(cites?.value).toContain(`${A} on wss://relay.example`);
    expect(fields.find((f) => f.label === 'Not cited')?.value).toMatch(/^2 linked reports rest on observations this package does not cite: their distribution does not reach/);
  });

  it('numbers them when there are several, and says nothing of citations when there are none', () => {
    const several = showManifest(manifest, [{ eventId: A }, { eventId: 'b'.repeat(64) }]).fields.map((f) => f.label);
    expect(several).toEqual(expect.arrayContaining(['Cites 1', 'Cites 2']));
    const none = showManifest(manifest).fields.map((f) => f.label);
    expect(none.some((l) => /^Cites|^Not cited/.test(l))).toBe(false);
    expect(showManifest(manifest, [], 1).fields.find((f) => f.label === 'Not cited')?.value).toMatch(/^One linked report rests on/);
  });
});
