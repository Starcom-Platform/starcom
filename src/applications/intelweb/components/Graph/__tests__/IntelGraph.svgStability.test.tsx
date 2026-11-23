/**
 * The graph SVG used to be torn down and rebuilt on every parent render.
 *
 * GraphEngine2D's initializeSimulation lists ten dependencies, four of which
 * were fresh identities on every render: sizeScale (built inline), selectedNodes
 * (`selectedNode ? [selectedNode] : []`), onEdgeClick (an inline arrow at the
 * call site), and onNodeClick (whose useCallback chains to onFileSelect, also
 * supplied inline by IntelWebApplication). The effect consuming it then runs
 * `selectAll('*').remove()`.
 *
 * WHY THIS TEST LIVES AT IntelGraph LEVEL. A test that renders GraphEngine2D
 * directly, holding its own props referentially stable, stays green while
 * production rebuilds on every render — it would assert the fix while testing
 * a situation the app never reaches. The regression only shows through a real
 * parent whose render passes fresh callback identities down.
 *
 * The observable consequence, beyond wasted work: the zoom handler writes its
 * transform onto the `g` captured in its closure, but a rebuild removes that
 * `g` and appends a fresh one with no transform. So a rebuild silently snaps
 * the user's pan and zoom back to origin.
 */
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntelGraph } from '../IntelGraph';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

const file = (name: string): VirtualFile => ({
  path: `/${name}.md`,
  name: `${name}.md`,
  extension: 'md',
  size: 10,
  mimeType: 'text/markdown',
  encoding: 'utf-8',
  hash: `h-${name}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  content: `# ${name}`,
} as VirtualFile);

const vault = (): VirtualFileSystem => {
  const files = [file('alpha'), file('bravo')];
  return {
    root: { path: '/', name: 'root', files, directories: [] } as never,
    fileIndex: new Map(files.map(f => [f.path, f])),
    directoryIndex: new Map(),
    relationshipGraph: [],
  };
};

/**
 * A parent that re-renders on demand and passes onFileSelect as an inline
 * arrow — exactly what IntelWebApplication does. Without that inline arrow the
 * test cannot see the bug it exists to catch.
 */
const Harness: React.FC<{ vfs: VirtualFileSystem }> = ({ vfs }) => {
  const [, setTick] = useState(0);
  return (
    <>
      <button onClick={() => setTick(t => t + 1)}>rerender</button>
      <IntelGraph vault={vfs} onFileSelect={() => {}} />
    </>
  );
};

describe('IntelGraph — the graph SVG survives a parent re-render', () => {
  it('keeps the same root <g> element when the parent renders again', () => {
    const { container } = render(<Harness vfs={vault()} />);

    const before = container.querySelector('svg > g');
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByText('rerender'));

    // Identity, not presence: a rebuild also produces *a* <g>, so asserting it
    // exists would pass against the bug.
    expect(container.querySelector('svg > g')).toBe(before);
  });

  it('survives several consecutive parent renders', () => {
    const { container } = render(<Harness vfs={vault()} />);
    const before = container.querySelector('svg > g');

    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText('rerender'));

    expect(container.querySelector('svg > g')).toBe(before);
  });

  it('keeps the same graph, and so the reader\'s pan and zoom, when a node is clicked', () => {
    // Critique audit of 2026-10-01, section 7. initializeSimulation depended
    // on the selection, so every click on a node wiped the SVG and restarted
    // the layout at full heat, losing the pan and zoom (plan block F, item 4).
    const { container } = render(<Harness vfs={vault()} />);
    const before = container.querySelector('svg > g');
    const node = container.querySelector('g.node-group');
    expect(node).not.toBeNull();

    fireEvent.click(node!);

    expect(container.querySelector('svg > g')).toBe(before);
  });

  it('still marks the node clicked as selected, without the rebuild', () => {
    const { container } = render(<Harness vfs={vault()} />);
    const node = container.querySelector('g.node-group')!;
    fireEvent.click(node);
    expect(container.querySelectorAll('circle.node-circle.selected').length).toBe(1);
  });
});
