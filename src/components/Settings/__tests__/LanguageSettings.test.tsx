/**
 * Settings > Language (decision D-ML, L1): choosing a language changes Starcom's screens at once, each
 * language named in itself; a machine-drafted one says so, and that parts still show in English.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MainSettings } from '../MainSettings';
import { setLanguage } from '../../../i18n/app/i18n';

afterEach(async () => { await setLanguage('en', false); localStorage.clear(); });

describe('Settings > Language', () => {
  it('names each language in itself, and changes the screen at once', async () => {
    render(<MainSettings onClose={() => {}} />);
    const select = screen.getByTestId('language-select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['English', 'Deutsch', 'Português (Brasil)', 'Português (Bahia)', 'Kiswahili', 'हिन्दी', 'Українська']);
    expect(screen.queryByTestId('language-status')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'uk' } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Налаштування'));
    expect(screen.getByTestId('language-status')).toHaveTextContent('Машинна чернетка: ще не перевірена носієм мови.');
    expect(screen.getByTestId('language-status')).toHaveTextContent('показуються англійською');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('says a Bahia review is what the Bahia layer waits for', async () => {
    render(<MainSettings onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('language-select'), { target: { value: 'pt-BR-bahia' } });
    await waitFor(() => expect(screen.getByTestId('language-status')).toHaveTextContent('ainda não revisado por alguém da Bahia'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Configurações');
  });
});
