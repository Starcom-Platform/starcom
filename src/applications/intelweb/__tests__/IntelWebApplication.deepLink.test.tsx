/**
 * Arriving in IntelWeb with a report in mind.
 *
 * The audit called this "the ONE genuinely small piece", and it was blocked
 * three times over: IntelGraph looped without bound, the graph pane had no
 * measurable height, and the wrapper's only intake was a `packageId` prop
 * nothing passed and the component never destructured.
 *
 * What these pin is the part that makes a deep-link trustworthy rather than
 * merely present — that landing on nothing is DISTINGUISHABLE from a broken
 * link. Two different absences, two different sentences: the report is gone,
 * or the report is here and the graph filtered it out.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IntelWebApplication } from '../IntelWebApplication';
import type { VirtualFileSystem, VirtualFile } from '../../../types/DataPack';

const file = (path: string, confidence: number): VirtualFile => ({
  path, name: path.split('/').pop()!, extension: 'md', size: 10,
  mimeType: 'text/markdown', encoding: 'utf-8', hash: `h-${path}`,
  createdAt: '2026-06-01T00:00:00.000Z', modifiedAt: '2026-06-01T00:00:00.000Z',
  content: '# Report', frontmatter: { confidence },
} as VirtualFile);

const vault = (files: VirtualFile[]): VirtualFileSystem => ({
  root: { path: '/', name: 'root', files, directories: [] } as never,
  fileIndex: new Map(files.map(f => [f.path, f])),
  directoryIndex: new Map(),
  relationshipGraph: [],
});

describe('IntelWebApplication — deep-link', () => {
  it('says the report is not in this vault, rather than opening nothing', async () => {
    render(<IntelWebApplication initialVault={vault([file('reports/a.md', 0.9)])} targetNotFound />);

    expect(await screen.findByTestId('deeplink-not-found')).toBeTruthy();
  });

  it('warns when the target resolves but the graph filter will hide it', async () => {
    // IntelGraph's default confidence range is [0.3, 1.0] and filterGraphData
    // drops non-matching nodes outright, so this link opens a real file that
    // renders no node — which reads as broken unless the absence is explained.
    render(
      <IntelWebApplication
        initialVault={vault([file('reports/low.md', 0.1)])}
        initialPath="reports/low.md"
      />
    );

    expect(await screen.findByTestId('deeplink-below-filter')).toBeTruthy();
  });

  it('stays quiet when the target is above the filter — nothing to disclose', async () => {
    render(
      <IntelWebApplication
        initialVault={vault([file('reports/ok.md', 0.9)])}
        initialPath="reports/ok.md"
      />
    );

    await waitFor(() => expect(screen.queryByTestId('deeplink-not-found')).toBeNull());
    expect(screen.queryByTestId('deeplink-below-filter')).toBeNull();
  });

  it('beats a stored tab preference — the link wins over a stale setting', async () => {
    // Found in a browser, invisible to the other tests here: localStorage is
    // empty in a fresh jsdom, so the restore effect never ran and the conflict
    // never appeared. With a saved preference it ran AFTER the deep-link and
    // put the user back on the Graph tab, so following a link to a report
    // opened it and then hid it.
    const files = [file('reports/ok.md', 0.9)];
    const ids = files.map(f => f.path).sort().join('|');
    let hash = 0; for (let i = 0; i < ids.length; i++) { hash = ((hash << 5) - hash) + ids.charCodeAt(i); hash |= 0; }
    localStorage.setItem(`intelweb:v1:${hash}:ui:activeTab`, 'graph');

    render(<IntelWebApplication initialVault={vault(files)} initialPath="reports/ok.md" />);

    // "File Content <name>" only renders when the File tab is active AND a file
    // is selected, so it proves both halves at once. Asserting on the tab
    // button is brittle here — the labels carry emoji prefixes ("📄 File").
    await waitFor(() => {
      expect(document.body.textContent).toContain('File Content');
      expect(document.body.textContent).toContain('ok.md');
    });
  });

  it('says nothing at all when no deep-link was used', async () => {
    render(<IntelWebApplication initialVault={vault([file('reports/a.md', 0.9)])} />);

    await waitFor(() => expect(screen.queryByTestId('deeplink-not-found')).toBeNull());
    expect(screen.queryByTestId('deeplink-below-filter')).toBeNull();
  });
});
