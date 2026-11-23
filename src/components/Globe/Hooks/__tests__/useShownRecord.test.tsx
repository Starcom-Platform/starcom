/**
 * The globe reads a shown Case or Mission from the live stores, not from a
 * snapshot taken when someone clicked "Show on the globe". Real persistence,
 * no mocks.
 */
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useShownRecord, type ShownRecord } from '../useShownRecord';
import type { ShownOnGlobe } from '../../../../context/GlobeContext';
import { intelCaseService } from '../../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import { missionService } from '../../../../services/intel/MissionService';

const report = (title: string, at?: { latitude: number; longitude: number }) =>
  intelReportService.createReport({ title, content: 'Body', category: 'general', tags: [], ...at }, 'analyst-1');
const aCase = (id: string): ShownOnGlobe => ({ kind: 'case', id });

describe('useShownRecord', () => {
  it('is nothing when nothing is shown', () => {
    const { result } = renderHook(() => useShownRecord(null));
    expect(result.current).toEqual({ status: 'none' });
  });

  it("draws the case's reports that have coordinates, and counts the rest by reason", async () => {
    const placed = await report('Placed', { latitude: 10, longitude: 20 });
    const unplaced = await report('Unplaced');
    const created = await intelCaseService.createCase({
      title: 'Pins',
      description: 'Body',
      relatedEntities: [placed.id, unplaced.id, 'no-such-record'],
    });

    const { result } = renderHook(() => useShownRecord(aCase(created.id)));
    expect(result.current).toEqual({ status: 'loading', target: aCase(created.id) });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const shown = result.current;
    if (shown.status !== 'ready') throw new Error('not ready');
    expect(shown.label).toContain('Pins');
    expect(shown.placement.markers.map((m) => m.pubkey)).toEqual([placed.id]);
    expect(shown.placement.linkedCount).toBe(3);
    expect(shown.placement.notDrawn).toEqual({ count: 2, byReason: { 'no-coordinates': 1, 'not-found': 1 } });
  });

  it("draws a mission's pins through its cases", async () => {
    const placed = await report('Through a case', { latitude: 5, longitude: 6 });
    const linked = await intelCaseService.createCase({ title: 'Linked case', description: 'Body', relatedEntities: [placed.id] });
    const mission = await missionService.createMission({ title: 'Shown mission', briefing: 'Body', relatedCases: [linked.id] });

    const { result } = renderHook(() => useShownRecord({ kind: 'mission', id: mission.id }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const shown = result.current;
    if (shown.status !== 'ready') throw new Error('not ready');
    expect(shown.target).toEqual({ kind: 'mission', id: mission.id });
    expect(shown.placement.markers.map((m) => m.pubkey)).toEqual([placed.id]);
    expect(shown.caseCount).toBe(1);
  });

  it('follows the stores: a linked report given coordinates later becomes a pin', async () => {
    const unplaced = await report('Placed later');
    const created = await intelCaseService.createCase({ title: 'Later', description: 'Body', relatedEntities: [unplaced.id] });
    const { result } = renderHook(() => useShownRecord(aCase(created.id)));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await intelReportService.saveReport({ ...unplaced, latitude: -5, longitude: 30 });

    await waitFor(() => {
      const shown = result.current;
      expect(shown.status === 'ready' ? shown.placement.markers.map((m) => m.pubkey) : shown.status).toEqual([unplaced.id]);
    });
  });

  it('counts a linked intel item as an intel item, not as missing', async () => {
    await intelWorkspaceManager.ensureInitialized();
    const item = intelWorkspaceManager.addIntelItem({
      title: 'Linked item', type: 'OBSERVATION', source: 'test', reliability: 'B', confidence: 0.5,
      tags: [], categories: [], latitude: 1, longitude: 2, content: 'Body',
    });
    const created = await intelCaseService.createCase({ title: 'With an item', description: 'Body', relatedEntities: [item.id] });

    const { result } = renderHook(() => useShownRecord(aCase(created.id)));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const shown = result.current;
    if (shown.status !== 'ready') throw new Error('not ready');
    expect(shown.placement.notDrawn).toEqual({ count: 1, byReason: { 'intel-item': 1 } });
  });

  it('says a case that does not exist is missing, not empty', async () => {
    const { result } = renderHook(() => useShownRecord(aCase('case-that-was-deleted')));
    await waitFor(() => expect(result.current).toEqual({ status: 'missing', target: aCase('case-that-was-deleted') }));
  });

  it("never shows one record's pins under another record's name, even for one render", async () => {
    const placed = await report('First case evidence', { latitude: 1, longitude: 2 });
    const first = await intelCaseService.createCase({ title: 'First', description: 'Body', relatedEntities: [placed.id] });
    const second = await intelCaseService.createCase({ title: 'Second', description: 'Body' });

    // Every value the hook returns, not only the last: the globe draws each one.
    const seen: ShownRecord[] = [];
    const { result, rerender } = renderHook(({ id }) => {
      const value = useShownRecord(aCase(id));
      seen.push(value);
      return value;
    }, { initialProps: { id: first.id } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const switched = seen.length;
    rerender({ id: second.id });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const afterSwitch = seen.slice(switched);
    expect(afterSwitch.every((v) => v.status !== 'none' && v.target.id === second.id)).toBe(true);
    const shown = result.current;
    if (shown.status !== 'ready') throw new Error('not ready');
    expect(shown.placement.markers).toEqual([]);
  });

  it('reads a record shown again afresh, rather than showing its earlier reading first', async () => {
    const created = await intelCaseService.createCase({ title: 'Shown twice', description: 'Body' });
    const seen: ShownRecord[] = [];
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => {
      const value = useShownRecord(id ? aCase(id) : null);
      seen.push(value);
      return value;
    }, { initialProps: { id: created.id as string | null } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ id: null });
    const again = seen.length;
    rerender({ id: created.id });
    expect(seen[again]).toEqual({ status: 'loading', target: aCase(created.id) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
