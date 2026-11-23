/**
 * The globe reads a package it is shown with everything the package carried:
 * its signer and its citations, not only its id (plan item 9.14).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useShownRecord } from '../useShownRecord';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';

const MECHA = 'a'.repeat(64);
beforeAll(async () => {
  await intelWorkspaceManager.ensureInitialized();
  await intelWorkspaceManager.addReport({
    id: `30023:${MECHA}:starcom-intel-ic-1`, title: 'Vienna alert', type: 'INTEL_REPORT', summary: '', content: 'x', conclusions: [], recommendations: [],
    analysisType: 'OSINT', methodology: [], confidence: 0.6, sourceIntel: [], author: MECHA, contributors: [],
    createdAt: '2026-09-28T10:00:00.000Z', modifiedAt: '2026-09-28T10:00:00.000Z', targetAudience: [],
    metadata: { history: [{ action: 'IMPORTED', timestamp: '2026-09-28T11:00:00.000Z', user: 'nostr' }], geo: { lat: 48.2, lon: 16.4 } },
  });
});

describe('useShownRecord', () => {
  it("reads a package with its signer and citations, and draws what it cites", async () => {
    const target = { kind: 'package' as const, id: 'evt-1', signer: MECHA, name: 'Nova', cites: ['ic-1', 'ic-9'] };
    const { result } = renderHook(() => useShownRecord(target));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.placement.markers.map((m) => m.pubkey)).toEqual([`30023:${MECHA}:starcom-intel-ic-1`]);
    expect(result.current.citations).toEqual({ cited: 2, found: 1, unresolved: ['ic-9'] });
  });
});
