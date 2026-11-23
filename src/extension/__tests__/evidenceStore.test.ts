/**
 * Where Starcom keeps evidence (decision D-EX, E2, W8): files by their SHA-256 and custody records by
 * item, in this browser's IndexedDB, read back as they were put.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { evidenceStore } from '../evidenceStore';
import type { KeptCustody } from '../keepEvidence';

describe('evidenceStore', () => {
  it('keeps a file by its hash and a record by its item, and reads them back', async () => {
    await evidenceStore.putFile('a'.repeat(64), new Blob(['The river rose.'], { type: 'text/plain' }));
    const file = await evidenceStore.getFile('a'.repeat(64));
    expect(await file?.text()).toBe('The river rose.');
    const record = { captureId: 'ev1', capture: { id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z', page: { url: 'https://news.example.org/' } } } as KeptCustody;
    await evidenceStore.putRecord('item-1', record);
    expect(await evidenceStore.getRecord('item-1')).toEqual(record);
    expect(await evidenceStore.getRecord('item-9')).toBeUndefined();
  });
});
