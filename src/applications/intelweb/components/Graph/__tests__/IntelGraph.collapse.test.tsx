/**
 * Collapsing clusters in IntelWeb (decision D-IW, IW9): a cluster of more than 12 notes opens as one
 * node with its count; a click on it opens it, a click on an open cluster's name closes it.
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
    ...Array.from({ length: 13 }, (_, i) => file(`reports/ye${i}.md`, { type: 'report', confidence: 0.8, jurisdictions: ['ye'] })),
    file('reports/sa0.md', { type: 'report', confidence: 0.8, jurisdictions: ['sa'] }),
    file('reports/sa1.md', { type: 'report', confidence: 0.8, jurisdictions: ['sa'] }),
  ];
  return { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
};
const nodeCount = (container: HTMLElement) => container.querySelectorAll('g.node-group').length;

describe('IntelGraph: collapsed clusters', () => {
  beforeEach(() => localStorage.clear());

  it('opens a cluster of more than 12 notes as one node with its count, the others open', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    expect(screen.getByText('Yemen · 13 notes')).toBeInTheDocument();
    // Yemen's node and Saudi Arabia's two notes.
    expect(nodeCount(container)).toBe(3);
  });

  it('opens it on a click, and closes it on a click on its name', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByText('Yemen · 13 notes').closest('g.node-group')!);
    expect(nodeCount(container)).toBe(15);
    expect(screen.queryByText('Yemen · 13 notes')).toBeNull();
    // The name's own text; its hover hint is a child of it.
    const name = [...container.querySelectorAll('text.cluster-label')].find((t) => t.firstChild?.textContent === 'Yemen')!;
    expect(name.querySelector('title')?.textContent).toBe('Close Yemen');
    fireEvent.click(name);
    expect(nodeCount(container)).toBe(3);
  });

  it('starts again from the rule when the notes are grouped another way', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByText('Yemen · 13 notes').closest('g.node-group')!);
    fireEvent.change(screen.getByRole('combobox', { name: 'Group by' }), { target: { value: 'desk' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Group by' }), { target: { value: 'country' } });
    expect(nodeCount(container)).toBe(3);
  });
});
