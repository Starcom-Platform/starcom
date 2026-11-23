/**
 * Search and Isolate that keep context (decision D-IW, step 3). A search dims what does not match
 * rather than removing it, so a hit keeps its surroundings, and says how many match; Isolate starts
 * from a node clicked, not a path typed.
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
    file('reports/a.md', { type: 'report', confidence: 0.8 }, 'Houthi strikes'),
    file('reports/b.md', { type: 'report', confidence: 0.8 }, 'Grain prices'),
    file('reports/c.md', { type: 'report', confidence: 0.8 }, 'Port closures'),
    file('tags/red_sea.md', { type: 'tag', confidence: 1, key: 'red_sea' }, '#red_sea'),
  ];
  return {
    root: { path: '/', name: 'root', files, directories: [] } as never,
    fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(),
    relationshipGraph: [rel('reports/a.md', 'tags/red_sea.md'), rel('reports/c.md', 'tags/red_sea.md')] as never,
  };
};
const groups = (container: HTMLElement) => [...container.querySelectorAll('g.node-group')];
const opacityOf = (container: HTMLElement, title: string) =>
  (groups(container).find((g) => g.querySelector('title')?.textContent?.includes(title) || g.textContent?.includes(title)) as SVGGElement).style.opacity;

describe('IntelGraph: search keeps context', () => {
  beforeEach(() => localStorage.clear());

  it('keeps every node, dims what does not match, and says how many match', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'houthi' } });
    expect(groups(container)).toHaveLength(4);
    expect(opacityOf(container, 'Houthi strikes')).toBe('1');
    expect(opacityOf(container, 'Grain prices')).toBe('0.15');
    expect(screen.getByTestId('intelweb-search-matches')).toHaveTextContent('1 of 4 matches');
  });

  it('undims everything when the search is cleared', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    const box = screen.getByRole('textbox', { name: 'Search nodes' });
    fireEvent.change(box, { target: { value: 'houthi' } });
    fireEvent.change(box, { target: { value: '' } });
    expect(opacityOf(container, 'Grain prices')).toBe('1');
    expect(screen.queryByTestId('intelweb-search-matches')).toBeNull();
  });
});

describe('IntelGraph: search, hover and clusters', () => {
  beforeEach(() => localStorage.clear());

  it('leaves the search\'s dimming as it was once a hover ends', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'houthi' } });
    const grain = groups(container).find((g) => g.textContent?.includes('Grain prices'))!;
    fireEvent.mouseOver(grain);
    fireEvent.mouseOut(grain);
    expect(opacityOf(container, 'Grain prices')).toBe('0.15');
    expect(opacityOf(container, 'Houthi strikes')).toBe('1');
  });

  it('lights a collapsed cluster that holds a match', () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`reports/ye${i}.md`, { type: 'report', confidence: 0.8, jurisdictions: ['ye'] }, i === 4 ? 'Port of Hodeidah' : `Yemen note ${i}`));
    const other = file('reports/sa.md', { type: 'report', confidence: 0.8, jurisdictions: ['sa'] }, 'Riyadh talks');
    const files = [...many, other];
    const v: VirtualFileSystem = { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
    const { container } = render(<IntelGraph vault={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'hodeidah' } });
    expect(opacityOf(container, 'Yemen · 13 notes')).toBe('1');
    expect(opacityOf(container, 'Riyadh talks')).toBe('0.15');
  });
});

describe('IntelGraph: Isolate from a node clicked', () => {
  beforeEach(() => localStorage.clear());

  it('offers Isolate once a node is selected, keeps its neighbourhood, and shows all again', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    expect(screen.queryByRole('button', { name: /^Isolate around/ })).toBeNull();
    fireEvent.click(groups(container).find((g) => g.textContent?.includes('#red_sea'))!);
    fireEvent.click(screen.getByRole('button', { name: 'Isolate around #red_sea' }));
    // The tag and the two notes it joins; Grain prices is not among them.
    expect(groups(container)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(groups(container)).toHaveLength(4);
  });

  it('asks for no path to be typed', () => {
    render(<IntelGraph vault={vault()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle graph controls' }));
    fireEvent.click(screen.getByRole('tab', { name: /Layout/ }));
    expect(screen.queryByPlaceholderText('Root node id')).toBeNull();
  });
});
