/**
 * The question of when a report's event happened, in the language chosen (decision D-ML, L3): the fields,
 * the precisions offered, what will be recorded, and what is wrong with what was entered.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, it, expect } from 'vitest';
import EventTimeFields from '../EventTimeFields';
import { EMPTY_EVENT_TIME_FIELDS, type EventTimeFields as Fields } from '../../../utils/eventTime';
import { setLanguage } from '../../../i18n/app/i18n';

afterEach(async () => { await setLanguage('en', false); });

const Harness: React.FC<{ initial?: Partial<Fields> }> = ({ initial }) => {
  const [value, setValue] = useState<Fields>({ ...EMPTY_EVENT_TIME_FIELDS, ...initial });
  return <EventTimeFields value={value} onChange={setValue} />;
};

describe('When it happened, asked in another language', () => {
  it('asks in Portuguese, offers the precisions in it, and says what it will record', async () => {
    await setLanguage('pt-BR', false);
    render(<Harness initial={{ startDate: '2026-07-27', precision: 'day' }} />);

    expect(screen.getByText('Quando aconteceu?')).toBeInTheDocument();
    const precision = screen.getByLabelText('Precisão') as HTMLSelectElement;
    expect([...precision.options].map((o) => o.textContent)).toEqual(['minuto', 'hora', 'dia', 'semana', 'mês', 'ano']);
    const day = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 6, 27));
    expect(screen.getByText(`Registrado como ${day}`)).toBeInTheDocument();
  });

  it('says in Hindi what is wrong with an end before the start', async () => {
    await setLanguage('hi', false);
    render(<Harness initial={{ startDate: '2026-07-27', endDate: '2026-07-20', precision: 'day' }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('अंत आरंभ से पहले है');
  });
});
