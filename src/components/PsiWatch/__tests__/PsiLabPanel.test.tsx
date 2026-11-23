/**
 * Psi Watch's lab (D-PW, PW94–PW96): a sky configuration explored against an event set, the windows' count marked on
 * the counts under time shifts, drawn, with no verdict; then the board's form, from the same configuration, its JSON
 * to copy, and nothing sent.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { EventSet } from '../../../services/psiWatch/timestream/eventSets';

const DAY = 86_400_000;
const T0 = Date.UTC(1940, 0, 1);
const STORMS: EventSet = {
  id: 'storms', ms: Float64Array.from(Array.from({ length: 700 }, (_, i) => T0 + i * 10 * DAY)), fromMs: T0, untilMs: T0 + 6999 * DAY,
  lat: null, lon: null, zone: null, zones: [], licence: '', credit: '',
};
vi.mock('../Timestream/useEventSet', () => ({ useEventSet: () => STORMS }));

import { PsiLabPanel } from '../PsiLabPanel';
import { openPsiLab, psiLab, resetPsiLabForTests } from '../../../features/psi/psiLabPanel';

beforeEach(() => resetPsiLabForTests());

describe('PsiLabPanel', () => {
  it('explores a Full Moon against the storms: the count in the windows marked on the shifted counts, no verdict', async () => {
    act(() => openPsiLab('explore'));
    render(<PsiLabPanel />);
    expect(screen.getByText('Experimental')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('psi-lab-class'), { target: { value: 'lunation' } });
    expect(psiLab().config.spec).toMatchObject({ class: 'lunation', sub: 'full' });
    fireEvent.click(screen.getByTestId('psi-lab-run'));
    const result = await screen.findByTestId('psi-lab-result', {}, { timeout: 10_000 });
    expect(result).toHaveTextContent(/Open record: 1 Jan 1940 to /);
    expect(screen.getByTestId('psi-lab-observed-line')).toHaveTextContent(/^Events in the windows: \d+$/);
    expect(screen.getByTestId('psi-lab-chart')).toBeInTheDocument();
    expect(result.textContent).not.toMatch(/p\s*=|significan|confirm|proves?/i);
  });

  it('drafts a test from the same configuration, its JSON to copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    act(() => openPsiLab('draft'));
    render(<PsiLabPanel />);
    // Nothing to copy until it has a title and a hypothesis.
    expect(screen.getByTestId('psi-lab-problems')).toHaveTextContent('Give it a title.');
    fireEvent.change(screen.getByTestId('psi-lab-title'), { target: { value: 'Mars square Saturn and storms' } });
    fireEvent.change(screen.getByTestId('psi-lab-hypothesis'), { target: { value: 'Storms begin more often within three days of Mars square Saturn.' } });
    const json = JSON.parse(screen.getByTestId('psi-lab-json').textContent!);
    expect(json).toMatchObject({ E: { adapter: 'kp_storm' }, S: { class: 'aspect', where: { bodies: ['Mars', 'Saturn'], n: 4, k: 1 } }, window: [0, 3] });
    await act(async () => { fireEvent.click(screen.getByTestId('psi-lab-copy')); });
    expect(writeText).toHaveBeenCalledWith(screen.getByTestId('psi-lab-json').textContent);
    expect(screen.getByTestId('psi-lab-said')).toHaveTextContent('Copied.');
  });
});
