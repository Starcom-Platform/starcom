/**
 * IntelWorkspaceManager — entityRefs wiring for intel items (Phase 2:
 * "populate entityRefs on reports"). Report-side wiring is covered by
 * reportMappers.roundtrip.vitest.ts; this covers the intel-item side —
 * addIntelItem/updateIntelItem/internalIntelToUI — which has its own
 * separate storage path (IntelItemInternal.frontmatter, not IntelReportData).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CreateIntelItemInput } from '../../../types/intel/IntelItemUI';

function makeIntelInput(overrides: Partial<CreateIntelItemInput> = {}): CreateIntelItemInput {
  return {
    title: 'Raw intel',
    type: 'OSINT',
    source: 'test-source',
    reliability: 'A',
    confidence: 0.5,
    tags: [],
    categories: [],
    content: 'raw content',
    ...overrides
  };
}

describe('IntelWorkspaceManager — entityRefs on intel items', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('addIntelItem stores and returns entityRefs set at creation', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const item = intelWorkspaceManager.addIntelItem(makeIntelInput({ entityRefs: ['John Smith', 'Acme Corp'] }));

    expect(item.entityRefs).toEqual(['John Smith', 'Acme Corp']);
    const reloaded = intelWorkspaceManager.getIntelItem(item.id);
    expect(reloaded?.entityRefs).toEqual(['John Smith', 'Acme Corp']);
  });

  it('an item created with no entityRefs has none, not a fabricated default', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const item = intelWorkspaceManager.addIntelItem(makeIntelInput());
    expect(item.entityRefs).toBeUndefined();
  });

  it('updateIntelItem can set entityRefs on an item that didn\'t have any at creation', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const item = intelWorkspaceManager.addIntelItem(makeIntelInput());
    intelWorkspaceManager.updateIntelItem({ ...item, entityRefs: ['Jane Doe'] });

    const reloaded = intelWorkspaceManager.getIntelItem(item.id);
    expect(reloaded?.entityRefs).toEqual(['Jane Doe']);
  });
});
