/**
 * IntelWeb's Radial (decision D-IW, IW14, step 7): with nothing selected, the most-linked hub at the
 * middle; selecting a node puts it there instead.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelGraph } from '../IntelGraph';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

const now = new Date().toISOString();
const file = (path: string, frontmatter: Record<string, unknown>, name?: string): VirtualFile => ({
  path, name: name ?? path.split('/').pop()!, extension: 'md', size: 10, mimeType: 'text/markdown', encoding: 'utf-8',
  hash: `h-${path}`, createdAt: now, modifiedAt: now, content: '# x', frontmatter, relationships: [],
} as VirtualFile);
const rel = (source: string, target: string) => ({ source, target, type: 'related', strength: 0.5, metadata: { predicate: 'tagged' } });
const vault = (): VirtualFileSystem => {
  const files = [
    file('reports/a.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye'] }, 'Note A'),
    file('reports/b.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye'] }, 'Note B'),
    file('reports/c.md', { type: 'report', confidence: 0.8, jurisdictions: ['sa'] }, 'Note C'),
    file('tags/busy.md', { type: 'tag', confidence: 1, key: 'busy' }, '#busy'),
    file('tags/quiet.md', { type: 'tag', confidence: 1, key: 'quiet' }, '#quiet'),
  ];
  return {
    root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(),
    relationshipGraph: [rel('reports/a.md', 'tags/busy.md'), rel('reports/b.md', 'tags/busy.md'), rel('reports/c.md', 'tags/busy.md'), rel('reports/c.md', 'tags/quiet.md')] as never,
  };
};
const centreOf = (container: HTMLElement) => [...container.querySelectorAll('g.node-group')]
  .find((g) => /translate\(0,\s*0\)/.test(g.getAttribute('transform') ?? ''))?.textContent;

describe('IntelGraph: the Radial', () => {
  beforeEach(() => localStorage.clear());

  it('puts the most-linked hub at the middle when nothing is selected, and names the spokes', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'radial' } });
    expect(centreOf(container)).toContain('#busy');
    expect([...container.querySelectorAll('text.radial-sector')].map((t) => t.textContent)).toEqual(['Yemen', 'Saudi Arabia', 'Others']);
  });

  it('puts a node selected at the middle instead', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'radial' } });
    fireEvent.click([...container.querySelectorAll('g.node-group')].find((g) => g.textContent?.includes('Note C'))!);
    expect(centreOf(container)).toContain('Note C');
  });
});
