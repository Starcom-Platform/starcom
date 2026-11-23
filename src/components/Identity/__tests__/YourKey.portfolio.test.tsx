/**
 * "Make my portfolio" in Your key (decision D-EX, EX12, EX31): it saves the page, says what it holds and
 * whether the relays sent everything, offers the JSON beside it, and says why when no portfolio was made.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import nostrService from '../../../services/nostrService';

const made = vi.hoisted(() => ({ result: null as unknown, error: null as Error | null }));
vi.mock('../../../services/portfolio/makePortfolio', () => ({
  makePortfolio: vi.fn(async () => { if (made.error) throw made.error; return made.result; }),
}));

import YourKey from '../YourKey';

const saved: string[] = [];
beforeEach(() => {
  nostrService.forgetIdentity();
  nostrService.ensureIdentity('writing a report');
  saved.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
  made.error = null;
  made.result = {
    html: '<html></html>', json: '{}',
    portfolio: { items: [{ shown: true }, { shown: true }, { shown: false }], events: [{}, {}], read: { complete: false } },
  };
});
afterEach(() => { nostrService.forgetIdentity(); vi.restoreAllMocks(); });

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Your key' }));

describe('Make my portfolio', () => {
  it('saves the page, says what it holds and that the relays did not send everything, and offers the JSON', async () => {
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Make my portfolio' }));
    await waitFor(() => expect(screen.getByTestId('your-portfolio-saved').textContent).toContain('Saved: 3 items, 2 in full, 1 listed only; 2 signed events.'));
    expect(screen.getByTestId('your-portfolio-saved').textContent).toContain('published work may be missing');
    expect(saved[0]).toMatch(/^starcom-portfolio-\d{4}-\d{2}-\d{2}\.html$/);
    fireEvent.click(screen.getByRole('button', { name: 'Save its record as JSON too' }));
    expect(saved[1]).toMatch(/^starcom-portfolio-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('says why when no portfolio was made', async () => {
    made.error = new Error('This browser has no key, so no work is under one yet.');
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Make my portfolio' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No portfolio was made: This browser has no key, so no work is under one yet.'));
  });
});
