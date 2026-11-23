/**
 * The gate before taking any field trial or field mission (decision D-RS, RS37, RS38, RS47; the legal review of
 * 2026-10-17): the age question, then the warning with its release, then, for 13 to 17, daylight and a parent or
 * guardian. A desk trial passes straight through.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FieldGate from '../FieldGate';
import { resetAge, setAgeAnswer } from '../../../services/identity/ageAnswer';
import { resetAdventures, agreeToWarning, GOING_OUT_AGREEMENT } from '../../../services/roster/adventure';

const Take = () => <button type="button">Take it</button>;
const take = () => screen.queryByRole('button', { name: 'Take it' });

beforeEach(() => { resetAge(); resetAdventures(); });

describe('FieldGate', () => {
  it('lets a desk trial straight through', () => {
    render(<FieldGate field={false}><Take /></FieldGate>);
    expect(take()).toBeTruthy();
  });

  it('asks how old, then the warning with its release, then offers it to someone 18 or over', () => {
    render(<FieldGate field><Take /></FieldGate>);
    const gate = screen.getByTestId('field-gate');
    expect(within(gate).getByTestId('age-question')).toBeTruthy();
    expect(take()).toBeNull();
    fireEvent.click(within(gate).getByLabelText('18 or over'));
    fireEvent.click(within(gate).getByRole('button', { name: 'Keep my answer' }));
    const warning = within(gate).getByTestId('going-out-warning');
    expect(warning.textContent).toContain('you release Starcom and its maker from claims arising from taking part, including negligence');
    expect(take()).toBeNull();
    fireEvent.click(within(warning).getByRole('checkbox', { name: GOING_OUT_AGREEMENT }));
    fireEvent.click(within(warning).getByRole('button', { name: 'Go on' }));
    expect(take()).toBeTruthy();
    expect(gate.textContent).toContain('You said you are 18 or over. Starcom asked; it did not check.');
  });

  it('13 to 17: in daylight, only after ticking a parent or guardian', () => {
    setAgeAnswer('13_15');
    agreeToWarning();
    render(<FieldGate field dark={false}><Take /></FieldGate>);
    expect(take()).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am going with my parent or guardian, or an adult they have authorised, in daylight' }));
    expect(take()).toBeTruthy();
  });

  it('13 to 17: never after dark, nor where dark is not known', () => {
    setAgeAnswer('16_17');
    agreeToWarning();
    const { rerender } = render(<FieldGate field dark><Take /></FieldGate>);
    expect(screen.getByTestId('field-gate').textContent).toContain('After dark: not for anyone under 18.');
    expect(screen.queryByRole('checkbox')).toBeNull();
    rerender(<FieldGate field dark={null}><Take /></FieldGate>);
    expect(take()).toBeNull();
  });

  it('pauses while the NWS is read, and when it cannot be', () => {
    setAgeAnswer('18_plus');
    agreeToWarning();
    const { rerender } = render(<FieldGate field nws="reading"><Take /></FieldGate>);
    expect(take()).toBeNull();
    rerender(<FieldGate field nws="unread"><Take /></FieldGate>);
    expect(screen.getByTestId('field-gate').textContent).toContain('could not be read here, so field trials are paused until it can be');
    rerender(<FieldGate field nws="read"><Take /></FieldGate>);
    expect(take()).toBeTruthy();
  });
});
