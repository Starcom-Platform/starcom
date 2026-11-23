/**
 * The widget says when the repository was last updated in UTC, with the year and
 * the local time on hover (decision D-E, settled 2026-09-14 for step 9). It gave
 * the browser's local date, and "Recently" when GitHub sent no date at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GitHubWidget from '../GitHubWidget';
import { localTimeTitle } from '../../../utils/utcTime';

const answer = (repo: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({
    stargazers_count: 47, forks_count: 9, watchers_count: 31, open_issues_count: 5, language: 'TypeScript', ...repo,
  }),
});

describe('GitHubWidget: when the repository was last updated', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('gives it in UTC, with the year and the local time on hover', async () => {
    const updated = Date.UTC(2026, 8, 10, 14, 5);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(answer({ updated_at: new Date(updated).toISOString() }));

    render(<GitHubWidget isOpen onClose={() => {}} />);

    expect(await screen.findByText('10 Sep 2026 14:05Z', {}, { timeout: 5000 })).toHaveAttribute('title', localTimeTitle(updated));
  });

  it('says the date is unavailable when GitHub sends none, rather than "Recently"', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(answer({}));

    render(<GitHubWidget isOpen onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Github Uplink Online/i)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('Last updated: unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Recently/)).toBeNull();
  });
});
