/**
 * Choosing how many Intel Reports the globe draws (BA4, BA5): 50, 100, 250,
 * 500, Max (1,000), Unlimited, or a number of one's own from 10, the choice in
 * force marked, and a word when this page's share handle has set it instead.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportCapChooser } from '../ReportCapChooser';

const mount = (cap: number | null, from: 'setting' | 'handle' = 'setting') => {
  const onChoose = vi.fn();
  render(<ReportCapChooser cap={cap} from={from} onChoose={onChoose} />);
  return onChoose;
};

describe('ReportCapChooser', () => {
  it('offers every step, Max and Unlimited, and marks the one in force', () => {
    mount(100);
    for (const label of ['50', '100', '250', '500', 'Max (1,000)', 'Unlimited']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '100' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '250' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('chooses a step, Max as 1,000 and Unlimited as no cap', () => {
    const onChoose = mount(50);
    fireEvent.click(screen.getByRole('button', { name: '250' }));
    fireEvent.click(screen.getByRole('button', { name: 'Max (1,000)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    expect(onChoose.mock.calls).toEqual([[250], [1000], [null]]);
  });

  it('takes a number of one\'s own from 10, and says why it will not take less', () => {
    const onChoose = mount(50);
    const input = screen.getByLabelText('A number of your own');
    fireEvent.change(input, { target: { value: '37' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChoose).toHaveBeenLastCalledWith(37);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toMatch(/a whole number from 10/);
  });

  it('marks a number of one\'s own as in force when it is not a step', () => {
    mount(37);
    expect(screen.getByText(/Drawing at most 37/)).toBeTruthy();
  });

  it('says reading more than 200 costs more', () => {
    mount(50);
    expect(screen.getByText(/more than 200 reads more from the relays/i)).toBeTruthy();
  });

  it('says when this page\'s share handle set the cap, which a choice here does not override for this page', () => {
    mount(1000, 'handle');
    expect(screen.getByText(/set for this page by the share handle/i)).toBeTruthy();
  });
});
