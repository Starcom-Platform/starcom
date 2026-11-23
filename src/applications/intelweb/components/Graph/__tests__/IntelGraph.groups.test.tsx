/**
 * IntelWeb's Group by (decision D-IW, IW8): country first, then the other ways, each cluster named,
 * and the notes in no group of the kind chosen in one that says so.
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
    file('reports/a.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye'], hashtags: ['conflict_desk'] }),
    file('reports/b.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye', 'sa'] }),
    file('reports/c.md', { type: 'report', confidence: 0.8 }),
    file('countries/ye.md', { type: 'country', confidence: 1, key: 'ye' }),
  ];
  return { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
};
// Each cluster's name, its own text: its hover hint is a child of it.
const labels = (container: HTMLElement) => [...container.querySelectorAll('text.cluster-label')].map((t) => t.firstChild?.textContent).sort();

describe('IntelGraph: Group by', () => {
  beforeEach(() => localStorage.clear());

  it('groups by country at first, each cluster named, and says which notes state none', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveValue('country');
    expect(labels(container)).toEqual(['No country stated', 'Yemen']);
  });

  it('offers every way of grouping', () => {
    render(<IntelGraph vault={vault()} />);
    const options = [...screen.getByRole('combobox', { name: 'Group by' }).querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Country', 'Theatre or event', 'Desk', 'Source', 'Category', 'Zone', 'Sector', 'Sphere']);
  });

  it('regroups when another way is chosen, and remembers it', () => {
    const { container, unmount } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Group by' }), { target: { value: 'desk' } });
    expect(labels(container)).toEqual(['#conflict_desk', 'No desk']);
    unmount();
    render(<IntelGraph vault={vault()} />);
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveValue('desk');
  });
});
