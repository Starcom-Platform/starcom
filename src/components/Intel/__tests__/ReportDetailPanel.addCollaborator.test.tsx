/**
 * ReportDetailPanel — Cycle 2 hardening pass.
 *
 * onAddCollaborator (IntelWorkspaceConsole.handleAddCollaborator) is a full
 * read-modify-write: build a new collaborators array from the current
 * report, save the whole record, refetch. Before this pass, a second click
 * on "Add" before the first save+refetch resolved would build its update
 * from the same stale collaborators array, and the second save would
 * silently overwrite the first collaborator. There was also no check for
 * adding the same userId twice.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

function makeReport(overrides: Partial<IntelReportUI> = {}): IntelReportUI {
  const now = new Date();
  return {
    id: 'report-1',
    title: 'Test Report',
    content: 'Body',
    author: 'tester',
    category: 'GENERAL',
    tags: [],
    createdAt: now,
    updatedAt: now,
    status: 'DRAFT',
    collaborators: [],
    ...overrides
  };
}

describe('ReportDetailPanel — add collaborator race/duplicate handling', () => {
  it('rejects adding the same userId twice without calling onAddCollaborator again', async () => {
    const onAddCollaborator = vi.fn().mockResolvedValue(undefined);
    const report = makeReport({
      collaborators: [{ userId: 'pk-existing', name: 'Existing', addedAt: new Date().toISOString(), addedBy: 'tester' }]
    });

    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={onAddCollaborator} />);

    fireEvent.change(screen.getByPlaceholderText('pubkey / user id'), { target: { value: 'pk-existing' } });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText(/already a collaborator/i)).toBeTruthy();
    expect(onAddCollaborator).not.toHaveBeenCalled();
  });

  it('disables the Add control while a submission is in flight, preventing a second click from racing the first', async () => {
    let resolveAdd: () => void = () => {};
    const onAddCollaborator = vi.fn().mockImplementation(() => new Promise<void>(resolve => { resolveAdd = resolve; }));
    const report = makeReport();

    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={onAddCollaborator} />);

    fireEvent.change(screen.getByPlaceholderText('pubkey / user id'), { target: { value: 'pk-new' } });
    fireEvent.click(screen.getByText('Add'));

    // While the first call is still pending, the control must be disabled —
    // a second click here (if the button weren't disabled) is exactly what
    // used to race the first save with a stale base array.
    await waitFor(() => expect(screen.getByText('Adding…')).toBeTruthy());
    fireEvent.click(screen.getByText('Adding…'));
    expect(onAddCollaborator).toHaveBeenCalledTimes(1);

    resolveAdd();
    await waitFor(() => expect(screen.queryByText('Adding…')).toBeNull());
  });

  it('surfaces a failed add as an inline error rather than silently discarding it', async () => {
    const onAddCollaborator = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const report = makeReport();

    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={onAddCollaborator} />);

    fireEvent.change(screen.getByPlaceholderText('pubkey / user id'), { target: { value: 'pk-new' } });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText(/network unavailable/i)).toBeTruthy();
    // The button re-enables after a failure so the user can retry, rather
    // than being stuck disabled forever.
    await waitFor(() => expect(screen.getByText('Add')).not.toBeDisabled());
  });

  it('a successful add clears the form for the next entry', async () => {
    const onAddCollaborator = vi.fn().mockResolvedValue(undefined);
    const report = makeReport();

    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={onAddCollaborator} />);

    const input = screen.getByPlaceholderText('pubkey / user id') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pk-new' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(onAddCollaborator).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('offers no access roles: adding asks only who, and a listed collaborator shows no role', () => {
    // A role picker from VIEWER to OWNER implied an access level nothing enforced,
    // and in local-first storage nothing could.
    const report = makeReport({
      collaborators: [{ userId: 'pk-existing', name: 'Existing', addedAt: new Date().toISOString(), addedBy: 'tester' }]
    });
    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={vi.fn()} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/VIEWER|COMMENTER|EDITOR|MANAGER|OWNER/)).toBeNull();
    expect(screen.getByText('Who is working on this report. Being listed grants no access.')).toBeTruthy();
  });
});
