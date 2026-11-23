/**
 * IntelWeb's time window, through the real graph (decision D-E).
 *
 * Nodes took their file's modification time, which a vault built from the
 * workspace sets to the moment it was built, and the window's range never
 * reached the engine, so the buttons dimmed nothing. This renders IntelGraph
 * itself: the controls, the node conversion and the engine together.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelGraph } from '../IntelGraph';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

const DAY = 86_400_000;
const builtNow = new Date().toISOString();

const file = (name: string, frontmatter: Record<string, unknown>): VirtualFile => ({
  path: `/reports/${name}.md`,
  name: `${name}.md`,
  extension: 'md',
  size: 10,
  mimeType: 'text/markdown',
  encoding: 'utf-8',
  hash: `h-${name}`,
  // As a vault built from the workspace stamps every file: the moment it was built.
  createdAt: builtNow,
  modifiedAt: builtNow,
  content: `# ${name}`,
  frontmatter,
  relationships: [],
} as VirtualFile);

const vault = (): VirtualFileSystem => {
  const files = [
    file('recent-event', { type: 'report', confidence: 0.8, startDate: new Date(Date.now() - 2 * DAY).toISOString(), timePrecisionMs: DAY }),
    file('undated', { type: 'report', confidence: 0.8, timestamp: new Date(Date.now() - 30 * DAY).toISOString() }),
  ];
  return {
    root: { path: '/', name: 'root', files, directories: [] } as never,
    fileIndex: new Map(files.map((f) => [f.path, f])),
    directoryIndex: new Map(),
    relationshipGraph: [],
  };
};

describe('IntelGraph: the time window places nodes by event time and dims the rest', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('says how many it placed by when they were written, and dims the node that falls outside', () => {
    const { container } = render(<IntelGraph vault={vault()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    fireEvent.click(screen.getByRole('button', { name: '7d' }));

    expect(screen.getByTestId('graph-placed-by-written')).toHaveTextContent(
      '1 of 2 records placed by when it was written — no stated event time.'
    );

    const opacities = [...container.querySelectorAll('circle')]
      .map((c) => c.getAttribute('fill-opacity'))
      .filter((o) => o !== null);
    expect(opacities).toEqual(['1', '0.15']);
  });
});
