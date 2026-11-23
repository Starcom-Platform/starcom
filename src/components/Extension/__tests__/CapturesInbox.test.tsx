/**
 * The captures waiting to be filed (decision D-EX, E2, W5; EX16): shown only while any wait; each to a
 * case, to a draft report that cites it, or discarded with Undo; and what was done is still said once
 * the capture has left the list.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CapturesInbox from '../CapturesInbox';
import { captureToItem } from '../../../extension/captureItems';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../../services/intel/IntelReportService';
import type { Capture } from '../../../extension/protocol';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const capture = (id: string, text: string): Capture => ({
  id, kind: 'selection', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/flood', title: 'Flood' }, text,
});

beforeEach(async () => {
  intelWorkspaceManager.resetForTests();
  localStorage.clear();
  await intelWorkspaceManager.ensureInitialized();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('CapturesInbox', () => {
  it('shows nothing while no capture waits', async () => {
    render(<CapturesInbox />);
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByTestId('captures-inbox')).toBeNull();
  });

  it('lists the captures no case holds, with what they are, where from and when captured, in UTC', async () => {
    const filed = intelWorkspaceManager.addIntelItem(captureToItem(capture('a', 'Filed already')));
    intelWorkspaceManager.addIntelItem(captureToItem(capture('b', 'The river rose 3 m overnight.')));
    await intelWorkspaceManager.addCase({ title: 'Flood', description: 'x', relatedEntities: [filed.id] } as never);
    render(<CapturesInbox />);
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(1));
    const row = screen.getByTestId('capture-row');
    expect(row.textContent).toContain('The river rose 3 m overnight.');
    expect(row.textContent).toContain('Words · news.example.org · 11 Oct 2026 21:05Z');
    expect(screen.getByText('Captures to file (1)')).toBeTruthy();
  });

  it('discards a capture with Undo, and Undo brings it back', async () => {
    const item = intelWorkspaceManager.addIntelItem(captureToItem(capture('c', 'Discard me')));
    render(<CapturesInbox />);
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(1));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Discard Discard me' })); });
    await waitFor(() => expect(screen.queryByTestId('captures-inbox')).toBeNull());
    expect(intelWorkspaceManager.getIntelItem(item.id)).toBeNull();
    act(() => { intelWorkspaceManager.restoreDeleted('item', item.id); });
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(1));
  });

  it('drafts a report citing the capture, and says so once the capture has left the list', async () => {
    const item = intelWorkspaceManager.addIntelItem(captureToItem(capture('d', 'Roads closed')));
    const created = vi.spyOn(intelReportService, 'createReport').mockImplementation(async (input) => {
      await intelWorkspaceManager.addReport({ id: 'intel-draft-1', title: input.title, content: input.content, sourceIntel: input.sourceIntelIds } as never);
      return { id: 'intel-draft-1' } as IntelReportUI;
    });
    render(<CapturesInbox />);
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Draft a report' }));
    await waitFor(() => expect(screen.getByTestId('capture-drafted').textContent).toContain('Drafted a report from "Roads closed", citing it.'));
    expect(created.mock.calls[0][0]).toMatchObject({ sourceIntelIds: [item.id], status: 'DRAFT' });
    expect(created.mock.calls[0][0]).not.toHaveProperty('visibility');
    expect(screen.queryAllByTestId('capture-row')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Open the draft' }).getAttribute('href')).toBe('/r/report/intel-draft-1');
  });

  it('files a capture to a case, asking how it bears on the case in a capture\'s words', async () => {
    intelWorkspaceManager.addIntelItem(captureToItem(capture('e', 'File me')));
    await intelWorkspaceManager.addCase({ title: 'Flood response', description: 'x' } as never);
    render(<CapturesInbox />);
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'File to case' }));
    await waitFor(() => expect(screen.getByTestId('add-to-case')).toBeTruthy());
    const select = screen.getByLabelText('Case') as HTMLSelectElement;
    const option = [...select.options].find((o) => o.textContent?.includes('Flood response'))!;
    fireEvent.change(select, { target: { value: option.value } });
    expect(screen.getByText('How does the capture bear on it?')).toBeTruthy();
  });
});
