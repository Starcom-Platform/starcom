/**
 * A case has a page, at its own address (plan item 1.2, stories S11 and S12).
 *
 * A case opened only as a dialog over the list, so it could not be linked to
 * directly, reloaded, or reached with Back. Its address now names it: the page
 * opens from a pasted link with its reports loaded, and leaving it returns to
 * the list at the list's address.
 *
 * Real persistence, like the other Cases suites.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CasesApplication from '../CasesApplication';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import UndoDeletionRoot from '../../../components/Undo/UndoDeletionRoot';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const Where: React.FC = () => <div data-testid="where">{useLocation().pathname}</div>;

function openAt(path: string, context: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><CasesApplication {...context} /><Where /><UndoDeletionRoot /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function seedCase(prefix: string) {
  const title = `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
  const id = await caseManagerAdapter.addCase({ title, description: 'Body', visibility: 'public' });
  if (!id) throw new Error('fixture: the case was not stored');
  return { id, title };
}

describe('the case page', () => {
  it('opens from its address with the case and its reports, not over the list', async () => {
    const { id, title } = await seedCase('Addressed');
    openAt(`/app/cases/${id}`);

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByRole('heading', { name: title })).toBeTruthy();
    expect(await within(page).findByTestId('no-linked-evidence', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: `View ${title}` })).toBeNull();
  });

  it('puts an opened case in the address, and returns to the list at its address', async () => {
    const { id, title } = await seedCase('Clicked');
    openAt('/app/cases');

    fireEvent.click(await screen.findByRole('button', { name: `View ${title}` }));
    expect(await screen.findByTestId('case-detail')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe(`/app/cases/${id}`);

    fireEvent.click(screen.getByRole('button', { name: /all cases/i }));
    expect(await screen.findByRole('button', { name: `View ${title}` })).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/app/cases');
  });

  it('moves a case handed over by another app into the address', async () => {
    const { id } = await seedCase('Handed');
    openAt('/app/cases', { selectCaseId: id });

    expect(await screen.findByTestId('case-detail')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe(`/app/cases/${id}`);
  });

  // Plan item 0.6: the page had no Delete, so a case could only be deleted from the list.
  it('deletes the case from its page, returns to the list, and Undo brings it back', async () => {
    const { id, title } = await seedCase('Deleted from its page');
    openAt(`/app/cases/${id}`);

    const page = await screen.findByTestId('case-detail');
    // Watched throughout, not checked once after: the page must not say "no
    // case has this address" about the case just deleted, even for a moment.
    let saidMissing = false;
    const watch = new MutationObserver(() => { saidMissing ||= /No case has this address/.test(document.body.textContent ?? ''); });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    fireEvent.click(within(page).getByRole('button', { name: 'Delete case' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/app/cases'));
    watch.disconnect();
    expect(saidMissing).toBe(false);
    await waitFor(() => expect(screen.queryByRole('button', { name: `View ${title}` })).toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: `View ${title}` })).toBeTruthy();
  });

  // Plan item 0.9: a demo case is marked, and says before the click that it
  // cannot be published.
  it('marks a sample case, and says before the click that its position is never published', async () => {
    const id = (await caseManagerAdapter.addCase({ title: `Seeded ${Math.random().toString(36).slice(2, 8)}`, description: 'Body', visibility: 'public', sample: true }))!;
    openAt(`/app/cases/${id}`);

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByText('Sample')).toBeTruthy();
    fireEvent.change(within(page).getByTestId('position-input'), { target: { value: 'Two of the five sites are closed.' } });
    fireEvent.change(within(page).getByTestId('verdict-select'), { target: { value: 'substantiated' } });
    fireEvent.click(within(page).getByTestId('state-position'));
    await within(page).findByTestId('publish-position');
    fireEvent.change(within(page).getByTestId('publish-subject'), { target: { value: 'Newark food bank network' } });

    expect(within(page).getByTestId('position-destination').textContent).toMatch(/sample material/i);
    expect((within(page).getByTestId('publish-position') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the address names no case', async () => {
    openAt('/app/cases/no-such-case');

    expect(await screen.findByText(/No case has this address/)).toBeTruthy();
  });
});
