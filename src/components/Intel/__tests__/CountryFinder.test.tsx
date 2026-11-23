/**
 * Finding a country by name in the report form, to say where a report is
 * about without knowing its code or its coordinates (plan item 3.5, story S6).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loaded = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../Globe/Hooks/useTerritories', () => ({
  loadTerritories: async () => {
    loaded.calls += 1;
    return { countries: () => [{ code: 'DE', name: 'Germany' }, { code: 'GE', name: 'Georgia' }, { code: 'NZ', name: 'New Zealand' }] };
  },
}));

import CountryFinder from '../CountryFinder';

describe('CountryFinder', () => {
  it('finds a country as its name is typed, and gives its code when chosen', async () => {
    const onChoose = vi.fn();
    render(<CountryFinder onChoose={onChoose} />);
    const box = screen.getByLabelText(/Find a country/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'zeal' } });
    fireEvent.click(await screen.findByRole('button', { name: 'New Zealand' }));
    expect(onChoose).toHaveBeenCalledWith('nz', 'New Zealand');
    expect((box as HTMLInputElement).value).toBe('');
  });

  it('loads the countries only when asked, once', async () => {
    const before = loaded.calls;
    render(<CountryFinder onChoose={vi.fn()} />);
    expect(loaded.calls).toBe(before);
    const box = screen.getByLabelText(/Find a country/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'ge' } });
    // Countries come first; the areas after them are the area registry's, which grows ("Germanosphere" matches too).
    await waitFor(() => expect(screen.getAllByRole('button').map((b) => b.textContent).slice(0, 2)).toEqual(['Georgia', 'Germany']));
    expect(loaded.calls).toBe(before + 1);
  });

  it('says so when nothing matches', async () => {
    render(<CountryFinder onChoose={vi.fn()} />);
    const box = screen.getByLabelText(/Find a country/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'atlantis' } });
    expect(await screen.findByText(/No country or area called that/)).toBeTruthy();
  });

  // BA24: an area, so a person can say a report is about the Sahel as a whole.
  it('finds an area too, says what kind it is, and gives its code when chosen', async () => {
    const onChoose = vi.fn();
    render(<CountryFinder onChoose={onChoose} />);
    const box = screen.getByLabelText(/Find a country or area/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'sahel' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Sahel Zone · zone' }));
    expect(onChoose).toHaveBeenCalledWith('zone:sahel', 'Sahel Zone');
  });

  it('countries first, then areas', async () => {
    render(<CountryFinder onChoose={vi.fn()} />);
    const box = screen.getByLabelText(/Find a country/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'new' } });
    // The country, then the Zones whose names share the word (the New Zealand Zone among them).
    await waitFor(() => expect(screen.getAllByRole('button').map((b) => b.textContent)).toContain('New Zealand Zone · zone'));
    const found = screen.getAllByRole('button').map((b) => b.textContent);
    expect(found[0]).toBe('New Zealand');
    expect(found.slice(1).every((t) => t?.endsWith(' · zone'))).toBe(true);
    fireEvent.change(box, { target: { value: 'eu' } });
    await waitFor(() => expect(screen.getAllByRole('button').map((b) => b.textContent)[0]).toBe('European Union · union'));
  });
});

describe('CountryFinder, countries only (a field-work region, D-MX MX11)', () => {
  it('offers countries and no areas, and says how to give a state', async () => {
    const onChoose = vi.fn();
    render(<CountryFinder onChoose={onChoose} countriesOnly />);
    const box = screen.getByLabelText('Find a country');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'sahel' } });
    expect(await screen.findByText(/No country called that. For a state, type its code in Region/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'zeal' } });
    fireEvent.click(await screen.findByRole('button', { name: 'New Zealand' }));
    expect(onChoose).toHaveBeenCalledWith('nz', 'New Zealand');
  });
});
