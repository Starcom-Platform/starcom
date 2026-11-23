/**
 * The cases list in the language chosen (decision D-ML, L3): the empty state, the new-case dialog with
 * its question of who may receive the case, and a case's priority said in the same words as its badge.
 *
 * A fresh file: the case store starts empty here.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { setLanguage } from '../../../i18n/app/i18n';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

afterEach(async () => { await setLanguage('en', false); });

describe('CasesDashboard — in another language', () => {
  it('says there are none yet, and asks the new case\'s questions, in Swahili', async () => {
    await setLanguage('sw', false);
    render(<CasesDashboard />);
    expect(await screen.findByText('Bado hakuna kesi')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tengeneza kesi ya kwanza' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Kesi mpya')).toBeTruthy();
    expect(within(dialog).getByTestId('case-distribution').textContent).toContain('Nani anaweza kupokea kesi hii?');
    expect(within(dialog).getByRole('button', { name: 'Tengeneza' })).toBeTruthy();
  });

  it('names a priority with the words its badge uses', async () => {
    render(<CasesDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create the first case' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Priority' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });
});
