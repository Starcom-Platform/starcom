/**
 * The question before a first key (decision D-RS, RS39): opened when something would make one, it answers with what
 * was kept; under 13 it says plainly that no key is made; "Not now" answers nothing.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import AgeQuestionRoot from '../AgeQuestionRoot';
import { UNDER_13_REFUSAL, askAge, ageAskable, resetAge, type AgeAnswer } from '../../../services/identity/ageAnswer';

beforeEach(() => resetAge());
afterEach(() => resetAge());

describe('AgeQuestionRoot', () => {
  it('registers to ask while mounted, and not after', () => {
    const { unmount } = render(<AgeQuestionRoot />);
    expect(ageAskable()).toBe(true);
    unmount();
    expect(ageAskable()).toBe(false);
  });

  it('asks neutrally, nothing chosen and nothing said of what an answer opens, and answers with what was kept', async () => {
    render(<AgeQuestionRoot />);
    expect(screen.queryByTestId('age-question-root')).toBeNull();
    let answered: AgeAnswer | null | undefined;
    act(() => { void askAge().then((a) => { answered = a; }); });
    const root = screen.getByTestId('age-question-root');
    expect(within(root).getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(root.textContent).not.toMatch(/13 or over|must be|allowed/i);
    fireEvent.click(within(root).getByLabelText('16 to 17'));
    await act(async () => { fireEvent.click(within(root).getByRole('button', { name: 'Keep my answer' })); });
    expect(answered).toMatchObject({ bracket: '16_17', method: 'self_declared' });
    expect(screen.queryByTestId('age-question-root')).toBeNull();
  });

  it('under 13, says plainly that no key is made, so nothing is posted', async () => {
    render(<AgeQuestionRoot />);
    act(() => { void askAge(); });
    fireEvent.click(screen.getByLabelText('Under 13'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep my answer' })); });
    expect(screen.getByTestId('age-question-root').textContent).toContain(UNDER_13_REFUSAL);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('age-question-root')).toBeNull();
  });

  it('"Not now" answers nothing', async () => {
    render(<AgeQuestionRoot />);
    let answered: AgeAnswer | null | undefined;
    act(() => { void askAge().then((a) => { answered = a; }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Not now' })); });
    expect(answered).toBeNull();
    expect(screen.queryByTestId('age-question-root')).toBeNull();
  });
});
