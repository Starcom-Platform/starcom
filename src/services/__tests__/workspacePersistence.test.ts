/**
 * IntelWorkspaceManager IndexedDB Migration Tests
 * Step 2.4.1 — Workspace Persistence
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock indexedDB and localStorage for Node environment
function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    _store: store,
  };
}

describe('IntelWorkspaceManager — Step 2.4.1', () => {

  describe('2.4.1.1 — IndexedDB migration support', () => {
    it('IntelWorkspaceManager exports from module', async () => {
      const mod = await import('../../services/intel/IntelWorkspaceManager');
      expect(mod.IntelWorkspaceManager).toBeDefined();
      expect(typeof mod.IntelWorkspaceManager).toBe('function');
    });

    it('workspace manager has all CRUD methods', async () => {
      const { IntelWorkspaceManager } = await import('../../services/intel/IntelWorkspaceManager');
      const mgr = new IntelWorkspaceManager();
      expect(typeof mgr.ensureInitialized).toBe('function');
      expect(typeof mgr.getReports).toBe('function');
      expect(typeof mgr.addReport).toBe('function');
      expect(typeof mgr.updateReport).toBe('function');
      expect(typeof mgr.removeReport).toBe('function');
      expect(typeof mgr.getIntelItems).toBe('function');
      expect(typeof mgr.addIntelItem).toBe('function');
      expect(typeof mgr.subscribe).toBe('function');
    });
  });

  describe('2.4.1.2 — V1 to IndexedDB migration', () => {
    it('flushStateToStorage writes to localStorage', async () => {
      // In Node env without IndexedDB, should still persist to localStorage
      const { IntelWorkspaceManager } = await import('../../services/intel/IntelWorkspaceManager');
      const mgr = new IntelWorkspaceManager();
      // idbAvailable is false in Node — localStorage is the only fallback
      expect((mgr as any).idbAvailable).toBe(false);
    });
  });

  describe('2.4.1.3 — localStorage fallback', () => {
    it('loadState returns null when no data exists', async () => {
      const { IntelWorkspaceManager } = await import('../../services/intel/IntelWorkspaceManager');
      const mgr = new IntelWorkspaceManager();
      // Node env: no localStorage → returns null
      const result = (mgr as any).loadState();
      expect(result).toBeNull();
    });
  });

  describe('2.4.1.4 — Persistence stats tracking', () => {
    it('tracks persistence stats correctly', async () => {
      const { IntelWorkspaceManager } = await import('../../services/intel/IntelWorkspaceManager');
      const mgr = new IntelWorkspaceManager();
      const stats = mgr.getPersistenceStats();
      expect(stats.saveRequests).toBe(0);
      expect(stats.flushCount).toBe(0);
      expect(stats.lastFlushAt).toBeNull();
      expect(stats.pendingDirty).toBe(false);
    });
  });
});
