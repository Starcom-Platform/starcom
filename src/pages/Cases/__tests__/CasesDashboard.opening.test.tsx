/**
 * Opening a case: by its link, by its row, by its View button — one page.
 *
 * Two faults this suite was written against (plan item 1.1):
 *
 *  - A link to a case (/r/case/:id) set the dialog's target and nothing else,
 *    so the reports were never loaded and the dialog read "Loading reports and
 *    intel…" for as long as it stayed open. A click loaded them. The prop's
 *    own comment promised the two would "land in one state rather than two
 *    that drift"; they had drifted.
 *  - A click on the row or on View called useCaseManager.selectCase, which
 *    nothing on this screen displays, and which set off the reload loop that
 *    replaced the whole table with a spinner.
 *
 * Real persistence throughout, like the other dashboard suites.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

async function seedCase(prefix: string) {
  const title = `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
  const id = await caseManagerAdapter.addCase({ title, description: 'Body' });
  if (!id) throw new Error('fixture: the case was not stored');
  return { id, title };
}

describe('CasesDashboard — opening a case', () => {
  // Plan item 1.2: a case opens as its own page, not as a dialog over the list.
  it('a case handed over opens its page with the reports loaded, not loading forever', async () => {
    const { id, title } = await seedCase('Linked');
    render(<CasesDashboard selectCaseId={id} />);

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByRole('heading', { name: title })).toBeTruthy();
    expect(await within(page).findByTestId('no-linked-evidence', undefined, { timeout: 5000 })).toBeTruthy();
    expect(within(page).queryByText(/Loading reports and intel/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking a row opens the same page, and "All cases" returns to the list', async () => {
    const { title } = await seedCase('Row');
    render(<CasesDashboard />);

    fireEvent.click(await screen.findByText(title));

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByRole('heading', { name: title })).toBeTruthy();
    expect(await within(page).findByTestId('no-linked-evidence', undefined, { timeout: 5000 })).toBeTruthy();

    fireEvent.click(within(page).getByRole('button', { name: /all cases/i }));
    // The list is back, not replaced by a spinner: its row's own button is there.
    expect(await screen.findByRole('button', { name: `View ${title}` })).toBeTruthy();
  });

  it('the View button opens the same page', async () => {
    const { title } = await seedCase('View');
    render(<CasesDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: `View ${title}` }));

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByRole('heading', { name: title })).toBeTruthy();
  });

  // Plan item 1.6, story S18: a row opened only on a mouse click. The title is
  // a real link: Tab reaches it, Enter opens the case, and it can be copied or
  // opened in a new tab like any address, now the case page's own.
  it("a case's title is a link to its page, and opens it here", async () => {
    const { id, title } = await seedCase('Titled');
    render(<CasesDashboard />);

    const link = await screen.findByRole('link', { name: title });
    expect(link.getAttribute('href')).toBe(`/app/cases/${id}`);
    fireEvent.click(link);

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByRole('heading', { name: title })).toBeTruthy();
  });

  it('has no separate Connections button: the page is the one way in', async () => {
    const { title } = await seedCase('Single');
    render(<CasesDashboard />);

    await screen.findByText(title);
    expect(screen.queryByRole('button', { name: `Connections for ${title}` })).toBeNull();
  });
});
