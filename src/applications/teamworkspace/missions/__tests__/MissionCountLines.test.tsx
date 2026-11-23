/**
 * What a mission asks to be counted (MX32): things, never people, each a line its package carries; locked with it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MissionCountLines } from '../MissionCountLines';

describe('MissionCountLines', () => {
  it('adds what to count as its line, by the button or Enter, and takes one off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MissionCountLines mission={{}} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mission-count-input'), { target: { value: 'Taps tested' } });
    fireEvent.click(screen.getByTestId('mission-count-add'));
    expect(onChange).toHaveBeenLastCalledWith(['Taps tested: a count']);
    rerender(<MissionCountLines mission={{ countLines: ['Taps tested: a count'] }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mission-count-input'), { target: { value: 'Filters fitted' } });
    fireEvent.keyDown(screen.getByTestId('mission-count-input'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['Taps tested: a count', 'Filters fitted: a count']);
    expect(screen.getByTestId('mission-count-line')).toHaveTextContent('Taps tested');
    fireEvent.click(within(screen.getByTestId('mission-count-line')).getByTestId('CancelIcon'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('refuses a count of people, saying why, and adds nothing', () => {
    const onChange = vi.fn();
    render(<MissionCountLines mission={{}} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mission-count-input'), { target: { value: 'Families helped' } });
    fireEvent.click(screen.getByTestId('mission-count-add'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('mission-count-lines')).toHaveTextContent('Count things, never people: say what was carried, placed or done.');
  });

  it('once its package is locked, says why, and neither adds nor takes off', () => {
    render(<MissionCountLines mission={{ countLines: ['Taps tested: a count'] }} onChange={vi.fn()} lockedBecause="Its package is locked." />);
    expect(screen.getByTestId('mission-count-lines')).toHaveTextContent('Its package is locked.');
    expect(screen.queryByTestId('mission-count-input')).toBeNull();
    expect(within(screen.getByTestId('mission-count-line')).queryByTestId('CancelIcon')).toBeNull();
  });
});
