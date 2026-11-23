/**
 * IntelWeb's Layout menu and its Timeline (decision D-IW, IW2, step 5): Clusters first; on a Timeline
 * the notes only, one row per group, named; remembered on this device.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelGraph } from '../IntelGraph';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

const now = new Date().toISOString();
const file = (path: string, frontmatter: Record<string, unknown>): VirtualFile => ({
  path, name: path.split('/').pop()!, extension: 'md', size: 10, mimeType: 'text/markdown', encoding: 'utf-8',
  hash: `h-${path}`, createdAt: now, modifiedAt: now, content: '# x', frontmatter, relationships: [],
} as VirtualFile);

const vault = (): VirtualFileSystem => {
  const files = [
    file('reports/a.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye'], startDate: '2026-10-01T00:00:00Z' }),
    file('reports/b.md', { type: 'report', confidence: 0.8, jurisdictions: ['sa'], startDate: '2026-10-08T00:00:00Z' }),
    file('countries/ye.md', { type: 'country', confidence: 1, key: 'ye' }),
  ];
  return { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
};

describe('IntelGraph: Layout and the Timeline', () => {
  beforeEach(() => localStorage.clear());

  it('opens in Clusters, and offers the Timeline', () => {
    render(<IntelGraph vault={vault()} />);
    const menu = screen.getByRole('combobox', { name: 'Layout' });
    expect(menu).toHaveValue('clusters');
    expect([...menu.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Clusters', 'Timeline', 'Map', 'Radial']);
  });

  it('on the Timeline draws the notes only, a row for each group, named', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'timeline' } });
    expect(container.querySelectorAll('g.node-group')).toHaveLength(2);
    expect([...container.querySelectorAll('text.timeline-row')].map((t) => t.textContent).sort()).toEqual(['Saudi Arabia', 'Yemen']);
    expect(container.querySelector('text.timeline-untimed')?.textContent).toBe('No time stated');
  });

  it('remembers the layout chosen', () => {
    const { unmount } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'timeline' } });
    unmount();
    render(<IntelGraph vault={vault()} />);
    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('timeline');
  });

  it('draws notes small on the Timeline, so those of one day stack in their row', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'timeline' } });
    for (const circle of container.querySelectorAll('g.node-group circle')) expect(Number(circle.getAttribute('r'))).toBeLessThanOrEqual(7);
  });
});

