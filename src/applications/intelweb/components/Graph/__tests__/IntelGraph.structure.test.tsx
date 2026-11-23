/**
 * IntelWeb draws what links its notes (decision D-IW, step 1): the hubs, mission packages and stubs
 * the vault now holds are node types of their own, on by default, each in a colour of its own, and
 * each note is linked to them. A type the filters did not list would have been dropped unseen.
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
    file('reports/a.md', { type: 'report', confidence: 0.8 }),
    file('reports/b.md', { type: 'report', confidence: 0.8 }),
    file('countries/ye.md', { type: 'country', confidence: 1 }),
    file('tags/war_map.md', { type: 'tag', confidence: 1 }),
    file('publishers/x.md', { type: 'publisher', confidence: 1 }),
    file('missions/m.md', { type: 'mission', confidence: 0.5, held: false }),
    file('stubs/s.md', { type: 'stub', confidence: 0.5, held: false }),
  ];
  const rel = (source: string, target: string, predicate: string) => ({ source, target, type: 'related', strength: 0.5, metadata: { predicate } });
  return {
    root: { path: '/', name: 'root', files, directories: [] } as never,
    fileIndex: new Map(files.map((f) => [f.path, f])),
    directoryIndex: new Map(),
    relationshipGraph: [
      rel('reports/a.md', 'countries/ye.md', 'in_country'), rel('reports/b.md', 'countries/ye.md', 'in_country'),
      rel('reports/a.md', 'tags/war_map.md', 'tagged'), rel('reports/b.md', 'publishers/x.md', 'published_by'),
      rel('reports/b.md', 'missions/m.md', 'names_mission'), rel('reports/b.md', 'stubs/s.md', 'refers'),
      rel('reports/b.md', 'reports/a.md', 'refers'),
    ] as never,
  };
};

describe('IntelGraph: what links the notes', () => {
  beforeEach(() => localStorage.clear());

  it('offers each new type in the filters, ticked, with its count', () => {
    render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    for (const type of ['country', 'tag', 'publisher', 'mission', 'stub']) {
      const box = screen.getByText(`${type} (1)`).parentElement!.querySelector('input')!;
      expect(box).toBeChecked();
    }
  });

  it('draws every node and every link', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    expect(container.querySelectorAll('circle').length).toBe(7);
    expect(container.querySelectorAll('line').length).toBe(7);
  });

  it('gives each kind a colour of its own', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    const fills = new Set([...container.querySelectorAll('circle')].map((c) => c.getAttribute('fill')));
    expect(fills.size).toBe(6);
  });
});
