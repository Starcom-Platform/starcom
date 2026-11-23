/**
 * Where a case's position goes, said before it is published (plan item 0.4).
 *
 * "Publish position" sent the case's verdict to the findings relays whatever
 * the case said. It now goes where the case may go, and when that is nowhere
 * the button is off and the screen says why, before the click rather than as
 * an error after it.
 *
 * Real persistence, no mocks on the case store — matching this directory.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

async function caseWithPosition(title: string, distribution: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
  const form = await screen.findByRole('dialog');
  fireEvent.change(within(form).getByLabelText(/^title/i), { target: { value: title } });
  fireEvent.change(within(form).getByLabelText(/^description/i), { target: { value: 'Body' } });
  fireEvent.click(within(form).getByRole('radio', { name: distribution }));
  fireEvent.click(within(form).getByRole('button', { name: /^create$/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });

  await screen.findByText(title);
  fireEvent.click(screen.getByRole('button', { name: `View ${title}` }));
  const dialog = await screen.findByTestId('case-detail');
  fireEvent.change(within(dialog).getByTestId('position-input'), { target: { value: 'Two of the five sites are closed.' } });
  fireEvent.change(within(dialog).getByTestId('verdict-select'), { target: { value: 'substantiated' } });
  fireEvent.click(within(dialog).getByTestId('state-position'));
  await within(dialog).findByTestId('publish-position');
  fireEvent.change(within(dialog).getByTestId('publish-subject'), { target: { value: 'Newark food bank network' } });
  return dialog;
}

describe("CasesDashboard — where a case's position goes", () => {
  it('will not publish a Private case\'s position, and says why before the click', async () => {
    render(<CasesDashboard />);
    const dialog = await caseWithPosition('Paterson shelters', /^Private/);

    expect(within(dialog).getByTestId('position-destination').textContent).toMatch(/This case is Private: it stays in this workspace/);
    expect((within(dialog).getByTestId('publish-position') as HTMLButtonElement).disabled).toBe(true);
  });

  it("says where a Public case's position goes, and lets it be published", async () => {
    render(<CasesDashboard />);
    const dialog = await caseWithPosition('Newark food banks', /^Public/);

    expect(within(dialog).getByTestId('position-destination').textContent).toMatch(/PUBLIC relays/);
    expect((within(dialog).getByTestId('publish-position') as HTMLButtonElement).disabled).toBe(false);
  });
});
