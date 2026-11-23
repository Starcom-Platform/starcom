/**
 * What NavCom reads of a mission's package, set on the mission (interchange
 * rev 11; D-MX, MX2, MX11, MX13): who takes it, and whether it is field work,
 * at a region until an end. A region, never a point.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MissionProfileFields from '../MissionProfileFields';

const END = '2026-11-30T23:59:59.000Z';

describe('MissionProfileFields', () => {
  it('asks who takes it, anybody by default, and saves one person', () => {
    const onChange = vi.fn();
    render(<MissionProfileFields mission={{}} onChange={onChange} />);
    expect((screen.getByLabelText('Anybody who joins') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('One person takes it'));
    expect(onChange).toHaveBeenCalledWith({ claims: 'one' });
  });

  it('turns field work on and off, saying what its package carries, never what NavCom shows', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MissionProfileFields mission={{}} onChange={onChange} />);
    expect(screen.getByText('Off: desk work. Its package names no region.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Field work for NavCom'));
    expect(onChange).toHaveBeenLastCalledWith({ fieldWork: {} });

    rerender(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-ca', until: END } }} onChange={onChange} />);
    expect(screen.getByText("Its package names the region and the end date, in the tags NavCom's map reads.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/drawn on NavCom/i);
    fireEvent.click(screen.getByLabelText('Field work for NavCom'));
    expect(onChange).toHaveBeenLastCalledWith({ fieldWork: undefined });
  });

  it('saves a region in lower case once it is left, keeping the end', () => {
    const onChange = vi.fn();
    render(<MissionProfileFields mission={{ fieldWork: { until: END } }} onChange={onChange} />);
    const region = screen.getByTestId('mission-profile-region');
    fireEvent.change(region, { target: { value: ' US-CA ' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(region);
    expect(onChange).toHaveBeenCalledWith({ fieldWork: { until: END, jurisdiction: 'us-ca' } });
  });

  it('ends at the end of the chosen day, in UTC, keeping the region', () => {
    const onChange = vi.fn();
    render(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-ca' } }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mission-profile-ends'), { target: { value: '2026-11-30' } });
    expect(onChange).toHaveBeenCalledWith({ fieldWork: { jurisdiction: 'us-ca', until: END } });
  });

  it('says the end again day first, in UTC, as the date field may put the month first', () => {
    const { rerender } = render(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-ca' } }} onChange={vi.fn()} />);
    expect(screen.getByText('The end of the day you choose, in UTC.')).toBeTruthy();
    rerender(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-ca', until: END } }} onChange={vi.fn()} />);
    expect(screen.getByText('Ends 30 Nov 2026 23:59Z: the end of that day, in UTC.')).toBeTruthy();
  });

  it('says the package of a mission that is not Public goes no further than its team', () => {
    const { rerender } = render(<MissionProfileFields mission={{ fieldWork: {} }} onChange={vi.fn()} reachesNavcom={false} />);
    expect(screen.getByTestId('mission-profile-unreached').textContent).toBe('This mission is not Public, so its package goes no further than your team.');
    rerender(<MissionProfileFields mission={{ fieldWork: {} }} onChange={vi.fn()} />);
    expect(screen.queryByTestId('mission-profile-unreached')).toBeNull();
    rerender(<MissionProfileFields mission={{}} onChange={vi.fn()} reachesNavcom={false} />);
    expect(screen.queryByTestId('mission-profile-unreached')).toBeNull();
  });

  it('says what field work still needs, and refuses a city', () => {
    const { rerender } = render(<MissionProfileFields mission={{ fieldWork: {} }} onChange={vi.fn()} />);
    expect(screen.getByTestId('mission-profile-problem').textContent).toMatch(/needs a region/);
    rerender(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-tx-leander', until: END } }} onChange={vi.fn()} />);
    expect(screen.getByTestId('mission-profile-problem').textContent).toMatch(/country or a state/);
  });

  it('is locked with the package, and says why', () => {
    render(<MissionProfileFields mission={{ fieldWork: { jurisdiction: 'us-ca', until: '2099-01-31T23:59:59.000Z' } }} onChange={vi.fn()} lockedBecause="Its package is locked." />);
    expect((screen.getByLabelText('Field work for NavCom') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('mission-profile-region') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('One person takes it') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('mission-profile-problem').textContent).toBe('Its package is locked.');
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
