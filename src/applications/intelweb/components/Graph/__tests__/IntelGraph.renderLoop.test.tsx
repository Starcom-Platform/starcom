/**
 * IntelGraph used to re-render without bound.
 *
 * The freeze effect depended on `graphData` while calling setGraphData with a
 * freshly-built object in BOTH branches, so every run scheduled the next. It
 * looped even for an empty vault, because [].map() returns a new array. The
 * component renders unconditionally in IntelWeb's main content pane, which is a
 * registered app in the bottom nav bar — so this was one click from any user.
 *
 * Two facts shaped these tests, both established by measurement rather than
 * assumption:
 *
 *  - The loop is SYNCHRONOUS. A 5s per-test vitest timeout could not preempt
 *    it, and an empty-vault render did not finish in 200s. So a hang here does
 *    not fail, it stalls the worker with no named assertion. That rules out
 *    "just render it and see" as the primary guard.
 *  - A render counter in a PARENT wrapper never fires — the parent renders once
 *    while the child loops beneath it.
 *
 * Hence the primary guard is the referential-identity contract of
 * applyFreezeState, which is a pure function, runs in microseconds, and CAN be
 * written red-first. The render smoke test below is real but secondary: it
 * could only ever land alongside the fix, never before it.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IntelGraph, applyFreezeState, type IntelNode } from '../IntelGraph';
import type { VirtualFileSystem } from '../../../../../types/DataPack';

const node = (over: Partial<IntelNode> = {}): IntelNode => ({
  id: `n-${Math.random().toString(36).slice(2)}`,
  type: 'report',
  confidence: 0.9,
  title: 'Node',
  tags: [],
  metadata: {},
  ...over,
});

describe('applyFreezeState — the referential contract that stops the loop', () => {
  it('returns the IDENTICAL array when releasing nodes that are already released', () => {
    // This is the empty-vault case generalised, and the exact assertion the old
    // code failed: it rebuilt every node unconditionally, so the array (and the
    // graphData object wrapping it) was new every single pass.
    const nodes = [node({ fx: null, fy: null }), node({ fx: null, fy: null })];

    expect(applyFreezeState(nodes, false)).toBe(nodes);
  });

  it('returns the IDENTICAL array when pinning nodes that are already pinned there', () => {
    const nodes = [node({ x: 10, y: 20, fx: 10, fy: 20 })];

    expect(applyFreezeState(nodes, true)).toBe(nodes);
  });

  it('returns the identical EMPTY array — the case that looped on a vault with no files', () => {
    const nodes: IntelNode[] = [];

    expect(applyFreezeState(nodes, false)).toBe(nodes);
    expect(applyFreezeState(nodes, true)).toBe(nodes);
  });

  it('still returns a NEW array when a pin genuinely changes, or the fix would be inert', () => {
    const nodes = [node({ x: 10, y: 20, fx: null, fy: null })];

    const pinned = applyFreezeState(nodes, true);

    expect(pinned).not.toBe(nodes);
    expect(pinned[0].fx).toBe(10);
    expect(pinned[0].fy).toBe(20);
  });

  it('releases a pinned node back to null', () => {
    const nodes = [node({ x: 10, y: 20, fx: 10, fy: 20 })];

    const released = applyFreezeState(nodes, false);

    expect(released).not.toBe(nodes);
    expect(released[0].fx).toBeNull();
    expect(released[0].fy).toBeNull();
  });

  it('leaves unchanged nodes referentially identical inside a changed array', () => {
    // Only the second node moves; the first must not be needlessly rebuilt, or
    // downstream identity checks (d3 rebinding, memoised children) churn.
    const stable = node({ x: 1, y: 2, fx: 1, fy: 2 });
    const moving = node({ x: 9, y: 9, fx: null, fy: null });

    const next = applyFreezeState([stable, moving], true);

    expect(next).not.toBe([stable, moving]);
    expect(next[0]).toBe(stable);
    expect(next[1]).not.toBe(moving);
  });
});

describe('IntelGraph render', () => {
  const emptyVault: VirtualFileSystem = {
    root: { path: '/', name: 'root', files: [], directories: [] } as never,
    fileIndex: new Map(),
    directoryIndex: new Map(),
    relationshipGraph: [],
  };

  it('completes a render on an empty vault', () => {
    // Honest note: this cannot fail informatively against the old code — it
    // HANGS rather than failing, which is why the identity tests above carry
    // the real weight. It is here because it is the actual user-facing symptom.
    expect(() => render(<IntelGraph vault={emptyVault} />)).not.toThrow();
  });
});
