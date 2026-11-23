/**
 * A change is saved when the page is left, not 300 ms later (found while
 * building plan item 1.8). Writes wait 300 ms to collapse a burst of edits into
 * one; a mission created and the page reloaded at once was lost, three times in
 * three on a build. The wait is kept; leaving the page ends it.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { missionService } from '../MissionService';

describe('the workspace, when the page is left', () => {
  it('writes a change still waiting to be written', async () => {
    await intelWorkspaceManager.ensureInitialized();
    await missionService.createMission({ title: 'Made just before leaving', briefing: 'Something.' } as never);
    expect(intelWorkspaceManager.getPersistenceStats().pendingTimerActive).toBe(true);
    const before = intelWorkspaceManager.getPersistenceStats().flushCount;

    window.dispatchEvent(new Event('pagehide'));

    const after = intelWorkspaceManager.getPersistenceStats();
    expect(after.flushCount).toBe(before + 1);
    expect(after.pendingTimerActive).toBe(false);
    expect(after.pendingDirty).toBe(false);
    // And says when, so a load can tell the newer of the two copies.
    const written = JSON.parse(localStorage.getItem('intelWorkspace.v1')!).metadata.savedAt;
    expect(Date.now() - written).toBeLessThan(5000);
  });

  it('writes it when the page is hidden, which is the last sure moment on a phone', async () => {
    await missionService.createMission({ title: 'Made just before switching away', briefing: 'Something.' } as never);
    const before = intelWorkspaceManager.getPersistenceStats().flushCount;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(intelWorkspaceManager.getPersistenceStats().flushCount).toBe(before + 1);
  });
});

describe('the workspace, loading after a page left mid-write', () => {
  // Written as the page went, the IndexedDB copy did not finish; the
  // localStorage copy, written at once, did. Loading took IndexedDB's, the
  // older, and the next write made the loss permanent.
  const leaveWithOnlyTheQuickCopyNewer = async (savedAtOffset: number) => {
    await intelWorkspaceManager.ensureInitialized();
    await missionService.createMission({ title: 'In both copies', briefing: 'Something.' } as never);
    intelWorkspaceManager.flushPendingSave();
    await new Promise((r) => setTimeout(r, 100));
    const quick = JSON.parse(localStorage.getItem('intelWorkspace.v1')!);
    quick.missions.push({ ...quick.missions[0], id: `mission-quick-${savedAtOffset}`, title: `Only in the quick copy ${savedAtOffset}` });
    quick.metadata = { ...quick.metadata, savedAt: (quick.metadata?.savedAt ?? Date.now()) + savedAtOffset };
    localStorage.setItem('intelWorkspace.v1', JSON.stringify(quick));
    intelWorkspaceManager.resetForTests();
    await intelWorkspaceManager.ensureInitialized();
    return intelWorkspaceManager.getMissions().map((m) => m.title);
  };

  it('takes the newer copy', async () => {
    expect(await leaveWithOnlyTheQuickCopyNewer(60_000)).toContain('Only in the quick copy 60000');
  });

  it('and not an older one', async () => {
    expect(await leaveWithOnlyTheQuickCopyNewer(-60_000)).not.toContain('Only in the quick copy -60000');
  });
});
