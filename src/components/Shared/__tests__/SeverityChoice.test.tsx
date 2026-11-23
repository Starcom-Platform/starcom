/**
 * Choosing how serious a report is (BD17, decided 2026-10-05): five buttons
 * side by side, each drawn as the badge it gives, so every level reads before
 * it is picked. Not assessed is a choice like the others, and the one held
 * until someone picks: a default level would read as an assessment.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SeverityChoice from '../SeverityChoice';

const group = () => screen.getByRole('radiogroup', { name: /^Severity/ });
const radio = (name: string) => within(group()).getByRole('radio', { name }) as HTMLInputElement;

describe('SeverityChoice', () => {
  it('offers the Cases scale as five buttons, each its badge, not assessed until chosen', () => {
    render(<SeverityChoice value={undefined} onChange={vi.fn()} />);
    const radios = within(group()).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Not assessed', 'Low', 'Medium', 'High', 'Critical']);
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
    expect(group().querySelectorAll('[data-testid="severity-badge"]')).toHaveLength(5);
  });

  it('gives the level picked, and nothing for not assessed', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SeverityChoice value={undefined} onChange={onChange} />);
    fireEvent.click(radio('High'));
    expect(onChange).toHaveBeenLastCalledWith('HIGH');
    rerender(<SeverityChoice value="HIGH" onChange={onChange} />);
    expect(radio('High').checked).toBe(true);
    expect(radio('Not assessed').checked).toBe(false);
    fireEvent.click(radio('Not assessed'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps two on one page apart', () => {
    render(<><SeverityChoice value="LOW" onChange={vi.fn()} /><SeverityChoice value="CRITICAL" onChange={vi.fn()} /></>);
    const [a, b] = screen.getAllByRole('radiogroup');
    expect((within(a).getByRole('radio', { name: 'Low' }) as HTMLInputElement).checked).toBe(true);
    expect((within(b).getByRole('radio', { name: 'Critical' }) as HTMLInputElement).checked).toBe(true);
    expect((within(a).getByRole('radio', { name: 'Low' }) as HTMLInputElement).name)
      .not.toBe((within(b).getByRole('radio', { name: 'Low' }) as HTMLInputElement).name);
  });

  it('says what the choice is, beside its name', () => {
    render(<SeverityChoice value={undefined} onChange={vi.fn()} hint="how serious, in your judgement" />);
    expect(group().getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(group().getAttribute('aria-describedby')!)?.textContent).toBe('how serious, in your judgement');
  });
});
