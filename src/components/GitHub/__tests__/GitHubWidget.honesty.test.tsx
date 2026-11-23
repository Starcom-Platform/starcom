/**
 * The widget must not invent repository statistics.
 *
 * ─── WHAT IT USED TO DO ────────────────────────────────────────────────────
 *
 * When the GitHub API returned an error, or the network was unreachable, both
 * fallback branches substituted:
 *
 *     stars: 12, forks: 3, watchers: 8, issues: 2
 *
 * commented "Fallback data for demo", and rendered them as this repository's
 * statistics. The footer said "Github Uplink Online" underneath, because its
 * condition was `repoStats.stars !== undefined` — true in every state the
 * component could reach, including both fallbacks.
 *
 * So a reader saw plausible numbers and an explicit claim that they came from
 * GitHub, in exactly the case where nothing had.
 *
 * ─── WHY A TEST AND NOT THE COMPILER ───────────────────────────────────────
 *
 * tsconfig.app.json sets "strict": false, so nothing in the build objects to a
 * null where a number was expected, and nothing objects to a number where the
 * truth is "we do not know". Here, vitest is the only authority.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { default: GitHubWidget } = await import('../GitHubWidget');

/** The exact values the old fallback invented. */
const INVENTED = ['12', '3', '8', '2'];

describe('GitHubWidget does not fabricate repository statistics', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows no numbers at all when the network is unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));

    render(<GitHubWidget isOpen onClose={() => {}} />);

    /*
     * Waits for content that only exists once loading has finished, NOT for
     * "Uplink Offline" — that is also the state while the fetch is still in
     * flight, so waiting on it returned immediately and the assertions below
     * ran against a spinner. The first version of this test failed for that
     * reason rather than finding anything wrong with the component.
     */
    await waitFor(() => expect(screen.getByText(/Last updated:/i)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/Uplink Offline/i)).toBeTruthy();

    /*
     * Located by their labels, not by class name: CSS modules do not resolve
     * to real class names under vitest, so `[class*="statNumber"]` matched
     * nothing and the first version of this test passed its loop vacuously
     * over zero elements. Asserting the count was what caught that.
     */
    for (const label of ['Stars', 'Forks', 'Watchers', 'Issues']) {
      const labelEl = screen.getByText(label);
      const shown = (labelEl.parentElement?.textContent || '').replace(label, '').trim();
      // An em dash is the honest answer; a number would be a claim.
      expect(shown).toBe('—');
      expect(INVENTED).not.toContain(shown);
    }
    expect(screen.getByText(/Last updated: unavailable/i)).toBeTruthy();
  });

  it('says the uplink is offline when GitHub answers with an error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 403, json: async () => ({ message: 'rate limited' }),
    });

    render(<GitHubWidget isOpen onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Last updated:/i)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/Uplink Offline/i)).toBeTruthy();
    expect(screen.queryByText(/Github Uplink Online/i)).toBeNull();
  });

  it('shows the real numbers, and says online, when GitHub answers — so the above is not vacuous', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      // All four distinct, so a value appearing in the wrong slot is visible.
      json: async () => ({
        stargazers_count: 47, forks_count: 9, watchers_count: 31,
        open_issues_count: 5, language: 'TypeScript', updated_at: '2026-09-10T00:00:00Z',
      }),
    });

    render(<GitHubWidget isOpen onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Github Uplink Online/i)).toBeTruthy(), { timeout: 5000 });
    const shownFor = (label: string) => {
      const el = screen.getByText(label);
      return (el.parentElement?.textContent || '').replace(label, '').trim();
    };
    expect(shownFor('Stars')).toBe('47');
    expect(shownFor('Forks')).toBe('9');
    expect(shownFor('Watchers')).toBe('31');
    expect(shownFor('Issues')).toBe('5');
  });
});
